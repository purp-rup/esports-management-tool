"""
Contracts / program forms.

Backend for everything contract-related:
  - which contracts a user can access (and which they've completed)
  - the form definitions (single source of truth for the modal, the
    server-side validation, and the read-only view of a signed form)
  - submitting a contract

Submissions live in contract_submissions (see contracts.sql); the answers
that vary by form are stored as JSON in its `responses` column.
"""
import json
import re
from datetime import datetime

import MySQLdb
import MySQLdb.cursors
import pytz
from flask import jsonify, request, session

EST = pytz.timezone('America/New_York')

# Z numbers: "Z" followed by digits. Loosened on purpose - tighten if you
# know the exact length (e.g. r'Z\d{8}').
Z_NUMBER_PATTERN = r'[Zz]\d{6,10}'

# Loose email check for the Parent Email field
EMAIL_PATTERN = r'[^@\s]+@[^@\s]+\.[^@\s]+'

def today_est():
    return datetime.now(EST).date()


# =====================================
# CONTRACT REGISTRY
# =====================================
# Every contract/form in the system, in the order they appear in the flyout.
# 'audience' controls who can see it (resolved in get_contract_access):
#   everyone   - any logged-in user
#   player     - users assigned to a team in the active season
#   leadership - admins / GMs (incl. custom roles), once the active season has started
CONTRACT_TYPES = [
    {'key': 'player_agreement',           'label': 'Player Agreement',           'audience': 'player'},
    {'key': 'media_agreement',            'label': 'Media Agreement',            'audience': 'player'},
    {'key': 'jersey_interest',            'label': 'Jersey Interest Form',       'audience': 'everyone'},
    {'key': 'leadership_agreement',       'label': 'Leadership Agreement',       'audience': 'leadership'},
    {'key': 'leadership_jacket_interest', 'label': 'Leadership Jacket Interest', 'audience': 'leadership'},
]
CONTRACT_LABELS = {c['key']: c['label'] for c in CONTRACT_TYPES}


# =====================================
# FORM DEFINITIONS
# =====================================
# A form is a list of blocks, rendered top to bottom:
#   section - read-only text (heading, paragraphs, bullet items; level='sub' for a sub-heading)
#   field   - something the user fills in. kind is one of:
#       text            single-line text (readonly + prefill pulls a value from the account)
#       radio           pick one (allow_other adds an "Other:" write-in)
#       checkbox_group  pick any number
#       acknowledge     a single required "I agree" checkbox (title/description/items above it)
#       signature       typed full legal name (stored in the signed_name column too)
#       date_auto       signature date, set by the server (never typed)
# To change a form's wording or fields after people have signed it, add a
# new version to FORMS - signed records keep rendering with the version they signed.

def _section(heading=None, paragraphs=(), items=(), level='main', step_label=None, icon=None,
             show_if=None):
    return {'type': 'section', 'heading': heading, 'paragraphs': list(paragraphs),
            'items': list(items), 'level': level, 'step_label': step_label, 'icon': icon,
            'show_if': show_if}


def _field(key, kind, label='', **opts):
    return {'type': 'field', 'key': key, 'kind': kind, 'label': label, **opts}


def _ack(key, title, description, statement):
    return _field(key, 'acknowledge', statement, title=title, description=[description], required=True)

LEADERSHIP_AGREEMENT_V1 = {
    'version': 1,
    'title': '{season} Leadership Agreement',   # {season} is filled with the active season's name
    'subtitle': 'Please provide the information below to complete your leadership agreement. '
                'This helps us ensure proper records and communication for your role within '
                'Stockton Esports.',
    'blocks': [
        _section(paragraphs=[
            'This Leadership Agreement outlines the responsibilities, expectations, and standards '
            'associated with serving in a leadership role within Stockton Esports.',
            'Stockton Esports leadership may include team leadership, executive leadership, '
            'administrative responsibilities, event operations, or other roles designated by the '
            'program. Leaders are expected to support the program, fulfill the responsibilities '
            'associated with their assigned role, communicate effectively, maintain appropriate '
            'confidentiality, and represent Stockton Esports and Stockton University professionally.',
            'This agreement supplements the Stockton Esports Player Participation, Agreement & '
            'Conduct Form and applicable Stockton University policies and procedures.',
        ]),

        _section('Leader Information & Leadership Term', [
            'Please provide your information and the leadership role or area in which you are '
            'serving within Stockton Esports.',
        ], step_label='Leader Information', icon='fa-user'),
        _field('email', 'text', 'Email', required=True, readonly=True, prefill='email'),
        _field('full_name', 'text', 'Full Name', required=True, prefill='full_name'),
        _field('z_number', 'text', 'Z Number', required=True, uppercase=True, max_length=20,
               pattern=Z_NUMBER_PATTERN,
               pattern_message='Enter your Z number: a Z followed by digits (e.g., Z00123456).',
               help='A Z followed by your digits (e.g., Z00123456).'),
        _field('department', 'radio', 'Department / Leadership Area', required=True, allow_other=True,
               options=['Senior Leadership', 'Game Management', 'Social Media', 'Production', 'Community']),
        _field('positions', 'checkbox_group', 'Leadership Position(s)', required=False,
               options=['Division Manager', 'Game Manager', 'Social Media Manager', 'Photographer',
                        'Stream Producer', 'Commentator', 'Content Producer', 'Event Liaison']),

        _section('Leadership Responsibilities & Commitment', [
            'Leadership roles within Stockton Esports require accountability, communication, '
            'organization, and commitment to the responsibilities associated with the position. '
            "Specific responsibilities may vary depending on a leader's department, position, team, "
            'project, or area of responsibility.',
            'Leaders are expected to fulfill their assigned responsibilities and contribute to the '
            'overall success of Stockton Esports.',
        ], step_label='Responsibilities', icon='fa-clipboard-list'),
        _section('Leadership Term & Appointment', [
            'I understand that my leadership role is assigned for the academic term indicated in this '
            'form unless otherwise specified. Leadership roles may be reviewed, renewed, modified, or '
            'ended by authorized Stockton Esports leadership based on program needs, performance, '
            'conduct, or other applicable circumstances.',
        ], level='sub'),
        _section('Commitment & Availability', [
            'I understand that leadership positions require consistent availability, timely '
            'communication, and fulfillment of responsibilities associated with my assigned role, '
            'including meetings, events, projects, competitions, administrative tasks, or other '
            'program activities when applicable.',
        ], level='sub'),
        _section('Role Responsibilities', [
            'I agree to fulfill the responsibilities associated with my assigned position and to '
            'complete tasks, projects, or assignments communicated by authorized Stockton Esports '
            'leadership in a timely and responsible manner.',
        ], level='sub'),
        _section('Leadership by Example', [
            'I understand that, as a leader, I am expected to model the professionalism, respect, '
            'accountability, communication, and sportsmanship expected of Stockton Esports participants.',
        ], level='sub'),
        _section('Collaboration & Communication', [
            'I agree to communicate effectively with Stockton Esports leadership, fellow leaders, '
            'participants, and other individuals relevant to my responsibilities. I will communicate '
            'concerns, challenges, or potential issues that may affect my responsibilities or the '
            'program when appropriate.',
        ], level='sub'),

        _section('Confidentiality, Communication & Representation', [
            'Leadership roles within Stockton Esports may provide access to internal communications, '
            'participant information, program decisions, unreleased content, and other information '
            'that may not be intended for general distribution.',
            'Leaders are expected to exercise appropriate discretion, communicate responsibly, and '
            'represent Stockton Esports and Stockton University professionally in all program-related '
            'settings.',
        ], step_label='Confidentiality', icon='fa-shield-halved'),
        _ack('ack_confidential_info', 'Confidential & Sensitive Information',
             'I understand that my leadership role may provide access to confidential, sensitive, or '
             'internal information, including but not limited to participant matters, internal '
             'communications, administrative decisions, program planning, team or roster information, '
             'unreleased content, and other information not intended for general distribution.',
             'I acknowledge and understand my responsibility to appropriately handle confidential and '
             'sensitive information.'),
        _ack('ack_confidentiality', 'Confidentiality Commitment',
             'I agree not to disclose, share, distribute, or misuse confidential or sensitive '
             'information obtained through my leadership role unless authorized by Stockton Esports '
             'leadership or required by applicable University policies or procedures.',
             'I agree to maintain appropriate confidentiality.'),
        _ack('ack_serious_concerns', 'Handling Serious Concerns',
             'I understand that serious concerns involving harassment, discrimination, threats, safety, '
             'misconduct, or other significant issues should be communicated to Stockton Esports '
             'leadership or appropriate University personnel rather than handled independently.',
             'I understand my responsibility to appropriately communicate serious concerns.'),
        _ack('ack_public_representation', 'Public & Online Representation',
             'I understand that my actions and communications while representing Stockton Esports may '
             'reflect on the program and Stockton University. I agree to communicate responsibly and '
             'professionally during events, competitions, streams, social media, Discord, meetings, and '
             'other public or program-related platforms.',
             'I agree to represent Stockton Esports professionally in public and online settings.'),
        _ack('ack_official_communications', 'Official Communications',
             'I understand that I may not make official statements, announcements, commitments, or '
             'representations on behalf of Stockton Esports or Stockton University unless authorized '
             'to do so.',
             'I understand the expectations regarding official communications.'),
        _ack('ack_information_sharing', 'Responsible Information Sharing',
             'I agree to communicate information accurately and appropriately within my area of '
             'responsibility and to avoid sharing incomplete, misleading, or unauthorized information '
             'that could negatively affect Stockton Esports, its participants, or its operations.',
             'I agree to communicate and share information responsibly.'),

        _section('Final Acknowledgment & Signature', [
            'Please review the statements below before submitting this agreement. Your submission '
            'confirms your understanding of and agreement to the expectations associated with your '
            'Stockton Esports leadership role.',
        ], step_label='Review & Sign', icon='fa-signature'),
        _field('ack_final', 'acknowledge',
               'I have read, understand, and agree to the Stockton Esports Leadership Agreement.',
               title='Final Leadership Agreement Confirmation', required=True,
               description=['By submitting this form, I acknowledge that:'],
               items=[
                   'I have read and understand the Stockton Esports Leadership Agreement.',
                   'I understand the responsibilities and expectations associated with serving in a '
                   'Stockton Esports leadership role.',
                   'I agree to fulfill the responsibilities associated with my assigned position to the '
                   'best of my ability.',
                   'I agree to maintain appropriate confidentiality and discretion regarding sensitive '
                   'information.',
                   'I understand that leadership responsibilities do not give me independent authority to '
                   'impose program-level disciplinary actions or override Stockton Esports leadership, '
                   'University policies, or established procedures.',
                   'I understand that failure to fulfill my responsibilities or violations of this '
                   'agreement may result in removal from my leadership role and/or referral to '
                   'appropriate University processes.',
                   'I understand that this agreement supplements, and does not replace, the Stockton '
                   'Esports Player Participation, Agreement & Conduct Form or applicable Stockton '
                   'University policies and procedures.',
                   'I confirm that the information provided in this form is accurate and complete.',
               ]),
        _field('signature', 'signature', 'Digital Signature (Type Full Name)', required=True,
               max_length=150,
               help='Typing your full legal name serves as your electronic signature.'),
        _field('signed_date', 'date_auto', 'Date of Signature', required=True),
    ],
}

PLAYER_AGREEMENT_V1 = {
    'version': 1,
    'title': '{season} Player Agreement & Conduct Form',
    'subtitle': 'This form establishes the participation requirements, responsibilities, conduct '
                'expectations, and accountability standards for students participating in '
                'Stockton Esports.',
    'blocks': [
        _section(paragraphs=[
            'All Stockton Esports players and team leaders are required to complete this form '
            'before participating in official Stockton Esports activities, competitions, '
            'practices, or team operations.',
            'By submitting this form, participants acknowledge that they have read, understand, '
            'and agree to follow the expectations outlined below, as well as applicable Stockton '
            'University policies, procedures, and rules.',
        ]),

        _section('Participant Information', [
            'Please provide your information as it appears in Stockton University records. This '
            'information will be used to identify your Stockton Esports participation and '
            'maintain program records.',
        ], step_label='Participant Information', icon='fa-user'),
        _field('email', 'text', 'Email', required=True, readonly=True, prefill='email'),
        _field('full_name', 'text', 'Full Name', required=True, prefill='full_name'),
        _field('z_number', 'text', 'Z Number', required=True, uppercase=True, max_length=20,
               pattern=Z_NUMBER_PATTERN,
               pattern_message='Enter your Z number: a Z followed by digits (e.g., Z00123456).',
               help='A Z followed by your digits (e.g., Z00123456).'),
        _field('gamertag', 'text', 'Preferred Name / Gamertag', required=True, max_length=50),
        _field('games', 'checkbox_group', 'Game Title(s) (select all games you will be competing for)', required=True,
               options=['Call of Duty', 'Super Smash Bros', 'Valorant', 'Marvel Rivals',
                        'Rocket League', 'Fortnite', 'Overwatch 2', 'Apex Legends']),

        _section('Player Participation Agreement', [
            'Participation in Stockton Esports is a privilege and requires participants to meet '
            'the expectations of the program, their team, and Stockton University. By '
            'participating, players agree to fulfill the responsibilities outlined in this form '
            'and represent Stockton Esports appropriately during all program-related activities.',
        ], step_label='Participation', icon='fa-handshake'),
        _field('ack_participation', 'acknowledge',
               'I have read, understand, and agree to the Stockton Esports Player Participation '
               'Agreement.',
               title='Participation Acknowledgement', required=True,
               description=['As a Stockton Esports participant, I agree to:'],
               items=[
                   'Participate in scheduled practices, competitions, meetings, events, and other '
                   'team activities to the best of my ability.',
                   'Communicate with my team leadership and Stockton Esports staff regarding '
                   'attendance, availability, and other participation-related matters.',
                   'Follow team procedures, coaching direction, tournament rules, and applicable '
                   'game/platform requirements.',
                   'Represent Stockton Esports and Stockton University in a professional and '
                   'respectful manner.',
                   'Maintain appropriate conduct during in-person and online program activities, '
                   'including matches, practices, Discord, livestreams, and other esports-related '
                   'spaces.',
                   'Respect my teammates, opponents, coaches, team leaders, staff, officials, and '
                   'other members of the Stockton University community.',
                   'Follow applicable Stockton University policies, procedures, and student '
                   'conduct requirements.',
                   'Use Stockton Esports equipment, facilities, accounts, and resources '
                   'responsibly.',
               ]),

        _section('Player & Team Responsibilities', [
            'Stockton Esports participants are expected to contribute positively to their team '
            'and fulfill the responsibilities associated with representing the program. The '
            'expectations below apply to all players and team leaders unless otherwise '
            'communicated by Stockton Esports staff.',
        ], step_label='Responsibilities', icon='fa-clipboard-list'),
        _section('Attendance & Participation', [
            'Players are expected to make a reasonable effort to attend scheduled practices, '
            'competitions, team meetings, events, and other required activities.',
            'When a player is unable to attend a scheduled activity, they are expected to '
            'communicate with their team leader or designated Stockton Esports staff member as '
            'early as reasonably possible.',
        ], level='sub'),
        _section('Communication', [
            'Players are expected to regularly monitor and respond to official Stockton Esports '
            'and team communications. This may include Discord, email, team messaging platforms, '
            'or other communication channels designated by Stockton Esports.',
            'Players are responsible for communicating schedule conflicts, absences, concerns, '
            'and other information that may affect their participation.',
        ], level='sub'),
        _section('Competitive Responsibilities', ['Players are expected to:'], items=[
            'Arrive prepared and on time for scheduled competitions.',
            'Follow tournament and league rules.',
            'Follow coaching and team leadership direction during competitive activities.',
            'Maintain competitive integrity and sportsmanship.',
            'Use only authorized game software, hardware, accounts, and tools.',
            'Notify team leadership of issues that may affect competitive participation.',
        ], level='sub'),
        _section('Team Responsibilities', [
            'Players are expected to contribute to a positive and productive team environment by:',
        ], items=[
            'Supporting teammates.',
            'Respecting team decisions and established procedures.',
            'Contributing to team practices and preparation.',
            'Completing responsibilities assigned by team leadership.',
            'Addressing disagreements respectfully and through appropriate channels.',
            'Avoiding behavior that intentionally disrupts team operations or morale.',
        ], level='sub'),
        _section('Equipment & Program Resources', [
            'Players are responsible for treating Stockton Esports equipment, facilities, '
            'accounts, and other program resources with care.',
            'Players may be held responsible for damage, misuse, unauthorized access, or other '
            'inappropriate use of program resources in accordance with applicable University '
            'policies and procedures.',
        ], level='sub'),
        _section('Academic & University Responsibilities', [
            "Participation in Stockton Esports does not replace a student's academic or "
            'University responsibilities. Players are expected to maintain their responsibilities '
            'as Stockton University students and comply with applicable University requirements.',
        ], level='sub'),

        _section('Code of Conduct & Sportsmanship', [
            'All Stockton Esports participants are expected to conduct themselves in a respectful, '
            'professional, and sportsmanlike manner. These expectations apply during '
            'competitions, practices, meetings, events, online activities, Discord, livestreams, '
            'social media when representing Stockton Esports, and other program-related '
            'interactions.',
            'Participants must also comply with applicable Stockton University policies and '
            'procedures. The expectations below are intended to supplement, not replace, '
            'University policies or disciplinary processes.',
        ], step_label='Code of Conduct', icon='fa-scale-balanced'),
        _section('Respect & Sportsmanship', [
            'Participants are expected to treat teammates, opponents, coaches, team leaders, '
            'staff, officials, spectators, and members of the Stockton University community '
            'with respect.',
            'Participants should demonstrate good sportsmanship regardless of the outcome of a '
            'competition and are expected to handle disagreements, criticism, and competitive '
            'frustration appropriately.',
        ], level='sub'),
        _section('Harassment & Discrimination', [
            'Stockton Esports does not tolerate harassment, discrimination, bullying, '
            'intimidation, or targeted abuse.',
            'Participants must not engage in conduct that targets an individual or group based '
            'on protected characteristics or otherwise creates a hostile, threatening, or '
            'inappropriate environment.',
        ], level='sub'),
        _section('Hate Speech, Slurs & Offensive Conduct', [
            'The use of slurs, hate speech, degrading language, threats, or other intentionally '
            'offensive conduct directed toward another person or group is prohibited.',
            'This expectation applies regardless of whether the conduct occurs in-game, in '
            'Discord, during a livestream, through social media, or in another Stockton '
            'Esports-related environment.',
        ], level='sub'),
        _section('Threats, Violence & Intimidation', [
            'Threats of violence, physical intimidation, credible threats, or other behavior '
            'intended to make another person feel unsafe are prohibited.',
            'Concerns involving immediate safety may be referred to appropriate University '
            'personnel or authorities.',
        ], level='sub'),
        _section('Cheating & Competitive Integrity', [
            'Participants are expected to maintain competitive integrity at all times.',
            'Prohibited conduct includes, but is not limited to:',
        ], items=[
            'Cheats, hacks, or unauthorized software',
            'Exploits intended to create an unfair competitive advantage',
            'Unauthorized modifications or third-party tools',
            'Account sharing when prohibited by the applicable game or tournament',
            'Match fixing or intentional manipulation of competition',
            'Collusion or other attempts to improperly influence competitive outcomes',
            'Impersonating another player',
            'Knowingly violating tournament or league rules',
        ], level='sub'),
        _section('Online & Digital Conduct', [
            'Stockton Esports expectations apply to program-related online spaces, including '
            'Discord servers, team communication platforms, game-related communication, '
            'livestreams, and other digital environments.',
            'Participants are expected to communicate appropriately and must not use these spaces '
            'to harass, threaten, intimidate, discriminate against, or intentionally disrupt '
            'others.',
        ], level='sub'),
        _section('Social Media & Public Representation', [
            'Participants are encouraged to recognize that their actions and public '
            'communications may affect the reputation of Stockton Esports and Stockton '
            'University.',
            'When representing Stockton Esports publicly, participants are expected to '
            'communicate responsibly and avoid conduct that falsely represents the program, '
            'misuses University branding, or intentionally harms the program or its members.',
        ], level='sub'),

        _section('Accountability & Program Standards', [
            'Stockton Esports is committed to maintaining a safe, respectful, and competitive '
            'environment. Participants who do not meet the expectations outlined in this '
            'agreement may be subject to appropriate program or University action.',
            'Responses to concerns will be handled based on the nature, severity, and '
            'circumstances of the situation and in accordance with applicable Stockton '
            'University policies and procedures.',
        ], step_label='Accountability', icon='fa-gavel'),
        _section('Addressing Concerns', [
            'Stockton Esports staff may address concerns involving participation, conduct, team '
            'responsibilities, competitive integrity, or other violations of program '
            'expectations.',
            'Depending on the circumstances, participants may be contacted to discuss the concern '
            'and provide relevant information or context.',
        ], level='sub'),
        _section('Possible Program Actions', [
            'When appropriate, Stockton Esports may take program-level action in response to '
            'violations of this agreement or program expectations. Actions may include, but are '
            'not limited to:',
        ], items=[
            'Verbal or written warnings',
            'Required meetings or corrective action',
            'Temporary restrictions from team or program activities',
            'Removal from a team or roster',
            'Suspension from Stockton Esports activities',
            'Removal from Stockton Esports',
            'Referral to appropriate University personnel or processes',
        ], level='sub'),
        _section('Serious or Immediate Concerns', [
            'Serious concerns, including allegations involving harassment, discrimination, '
            'threats, violence, retaliation, sexual misconduct, or other conduct subject to '
            'University policy may be referred to appropriate Stockton University offices or '
            'personnel.',
            'Stockton Esports may take appropriate interim program action when necessary while a '
            'concern is being reviewed.',
        ], level='sub'),
        _section('Competitive Eligibility', [
            "A participant's eligibility to compete may be affected by violations of team "
            'expectations, tournament or league rules, competitive integrity requirements, '
            'University requirements, or other applicable program standards.',
            'Eligibility decisions may be made by authorized Stockton Esports staff and, when '
            'applicable, in accordance with tournament, league, or University requirements.',
        ], level='sub'),
        _section('Reporting Concerns', [
            'Participants are encouraged to report significant concerns involving safety, '
            'harassment, discrimination, threats, cheating, competitive integrity, or other '
            'serious violations to Stockton Esports staff or the appropriate University '
            'personnel.',
            'Participants should not retaliate against another person for raising a good-faith '
            'concern or participating in a review or University process.',
        ], level='sub'),

        _section('Final Acknowledgment & Signature', [
            'Please review the statements below before submitting this form. By signing, you '
            'confirm that you have read, understand, and agree to the Stockton Esports Player '
            'Participation, Agreement & Conduct Form.',
        ], step_label='Review & Sign', icon='fa-signature'),
        _field('ack_final', 'acknowledge',
               'I acknowledge and agree to the statements above.',
               title='Final Acknowledgement', required=True,
               description=['By submitting this form, I confirm that:'],
               items=[
                   'I have read and understand the Stockton Esports Player Participation, '
                   'Agreement & Conduct Form.',
                   'I understand the responsibilities and expectations associated with '
                   'participating in Stockton Esports.',
                   "I agree to follow the program's participation, team, conduct, sportsmanship, "
                   'and competitive integrity standards.',
                   'I understand that I am responsible for following applicable Stockton '
                   'University policies, procedures, and student conduct requirements.',
                   'I understand that violations of program expectations may result in '
                   'appropriate program or University action.',
                   'I understand that the information I provided is accurate and complete.',
                   'If I serve as a Student Leader, I understand that I am also responsible for '
                   'the additional expectations outlined in the Stockton Esports Leadership '
                   'Agreement.',
               ]),
        _field('signature', 'signature', 'Digital Signature (Full Legal Name)', required=True,
               max_length=150,
               help='Typing your full legal name serves as your electronic signature.'),
        _field('signed_date', 'date_auto', 'Date of Signature', required=True),
    ],
}

# Answer that reveals the parent/guardian section of the media agreement
MEDIA_MINOR_ANSWER = 'I am under 18 and have obtained parental/guardian consent'
IF_MINOR = {'field': 'age_confirmation', 'equals': MEDIA_MINOR_ANSWER}

MEDIA_AGREEMENT_V1 = {
    'version': 1,
    'title': '{season} Media Agreement & Release Form',
    'subtitle': 'This agreement authorizes Stockton Esports and Stockton University to capture and '
                'use media involving participants for official purposes.',
    'blocks': [
        _section('Purpose', [
            'This agreement authorizes Stockton Esports and Stockton University to capture and use '
            'media involving participants for official esports, educational, informational, '
            'promotional, marketing, and recruitment purposes for the {season} season.',
        ], step_label='Media Agreement', icon='fa-file-contract'),
        _section('Media Release', [
            'I grant Stockton Esports and Stockton University permission to photograph, video '
            'record, livestream, audio record, and otherwise capture my likeness, voice, '
            'username/gamertag, gameplay, and participation during Stockton Esports-related '
            'activities, including matches, practices, events, broadcasts, and promotional '
            'activities.',
            'I understand that this media may be edited, reproduced, published, and distributed '
            'through University and Stockton Esports websites, social media, broadcasts, '
            'promotional materials, recruitment materials, and other official channels without '
            'financial compensation.',
        ], level='sub'),
        _section('Rights & Revocation', [
            'I understand that I will not receive compensation and that I will not have the right '
            'to inspect or approve final media. Media will be used respectfully and consistent '
            'with applicable University standards.',
            'This authorization remains in effect while I participate in Stockton Esports. I may '
            'revoke my authorization in writing for future use; however, revocation does not '
            'require the removal of media that has already been published or distributed.',
        ], level='sub'),
        _section('Important', [
            'This agreement applies only to Stockton Esports and Stockton University-related '
            'activities and use.',
        ], level='sub'),

        _section('Participant Information', [
            'Please provide your information as it appears in Stockton University records.',
        ], step_label='Participant Information', icon='fa-user'),
        _field('email', 'text', 'Email', required=True, readonly=True, prefill='email'),
        _field('full_name', 'text', 'Full Name', required=True, prefill='full_name'),
        _field('z_number', 'text', 'Z Number', required=True, uppercase=True, max_length=20,
               pattern=Z_NUMBER_PATTERN,
               pattern_message='Enter your Z number: a Z followed by digits (e.g., Z00123456).',
               help='A Z followed by your digits (e.g., Z00123456).'),
        _field('gamertag', 'text', 'Preferred Name / Gamertag', required=True, max_length=50,
               help='Please enter the name or gamertag you commonly use when participating in '
                    'Stockton Esports.'),
        _field('games', 'checkbox_group',
               'Game / Team (select all you are currently participating in)', required=True,
               options=['Call of Duty', 'Super Smash Bros', 'Valorant', 'Marvel Rivals',
                        'Rocket League', 'Fortnite', 'Overwatch 2', 'Apex Legends']),
        _field('role', 'radio', 'Participant Role', required=True, allow_other=True,
               options=['Student Leader', 'Player', 'Student Leader & Player']),

        _section('Consent & Age Confirmation', [
            'Please confirm that you have reviewed the Media Agreement & Release and provide your '
            'age confirmation below.',
        ], step_label='Consent & Age', icon='fa-circle-check'),
        _field('ack_media_release', 'acknowledge',
               'I have read and understand the Media Agreement & Release and voluntarily authorize '
               'Stockton Esports and Stockton University to capture and use my media as described '
               'in this agreement.',
               title='Media Release Content', required=True,
               description=['By selecting the option below, you confirm that you have read and '
                            'understand the Media Agreement & Release above and voluntarily '
                            'provide the permissions described in that agreement.']),
        _field('age_confirmation', 'radio', 'Age Confirmation: Are you 18 years of age or older?',
               required=True,
               options=['I am 18 years of age or older', MEDIA_MINOR_ANSWER]),

        _section('Parent / Guardian Consent (Under 18 Only)', [
            'This section must be completed by a parent or legal guardian for participants under '
            '18 years of age. By completing this section, the parent or legal guardian confirms '
            'that they have reviewed and consent to the Stockton Esports Media Agreement & '
            'Release on behalf of the participant.',
        ], level='sub', show_if=IF_MINOR),
        _field('parent_name', 'text', 'Parent / Guardian Full Name', required=True,
               max_length=150, show_if=IF_MINOR),
        _field('parent_relationship', 'radio', 'Relationship to Participant', required=True,
               allow_other=True, options=['Parent', 'Legal Guardian'], show_if=IF_MINOR),
        _field('parent_email', 'text', 'Parent / Guardian Email Address', required=True,
               max_length=150, pattern=EMAIL_PATTERN,
               pattern_message='Enter a valid email address.',
               help='Please provide an email address where the parent or legal guardian may be '
                    'contacted regarding this consent.',
               show_if=IF_MINOR),
        _field('parent_consent', 'acknowledge',
               'I provide my consent.',
               title='Parent / Guardian Consent', required=True, show_if=IF_MINOR,
               description=[
                   'By selecting the option below, you confirm that you have reviewed the '
                   'Stockton Esports Media Agreement & Release and are authorized to provide '
                   'consent on behalf of the participant.',
                   "Consent: I have reviewed and understand the Stockton Esports Media Agreement "
                   '& Release and voluntarily authorize Stockton Esports and Stockton University '
                   "to capture and use the participant's likeness, voice, username/gamertag, "
                   'gameplay, and participation as described in the agreement.',
               ]),
        _field('parent_signature', 'signature', 'Parent / Guardian Electronic Signature',
               required=True, max_length=150, secondary=True, show_if=IF_MINOR,
               help='Typing your full legal name serves as your electronic signature.'),
        _field('parent_signed_date', 'date_auto', 'Parent / Guardian Date of Signature',
               required=True, show_if=IF_MINOR),

        _section('Media Visibility & Identification Preferences', [
            'These preferences help Stockton Esports understand how you would like your name, '
            'gamertag, and other identifying information displayed in esports-related media and '
            'content. These preferences do not replace or modify the Media Agreement & Release '
            'provided earlier in this form.',
        ], step_label='Preferences', icon='fa-eye'),
        _section('Name & Gamertag Display', [
            'How may your name, gamertag, or other identifier be displayed in Stockton '
            'Esports-related media and platforms?',
        ], level='sub'),
        _field('name_display', 'radio', 'Display Preference', required=True,
               options=['Gamertag / Username Only', 'First Name Only',
                        'First Name + Gamertag / Username', 'Full Name', 'Any of the Above']),
        _section('Content Types', [
            'What types of Stockton Esports-related content may include your likeness, voice, '
            'gameplay, or identifier?',
        ], level='sub'),
        _field('content_types', 'checkbox_group', 'Content Types', required=False,
               options=['Livestreams & Broadcasts', 'Social Media', 'Team & Player Graphics',
                        'Stockton Esports Website', 'Promotional & Marketing Materials',
                        'Recruitment Materials', 'Tournament & Event Coverage',
                        'Educational & Informational Content',
                        'Other Official Stockton Esports Content']),
        _section('Optional Notes or Restrictions', [
            'If you have any specific preferences or restrictions regarding how your name, '
            'gamertag, likeness, voice, or gameplay is used in Stockton Esports-related media, '
            'please describe them below.',
        ], level='sub'),
        _field('notes', 'text', 'Notes or Restrictions', required=False, max_length=500),

        _section('Final Acknowledgment & Signature', [
            'Please review the acknowledgement below before submitting this form. Your '
            'electronic signature confirms your understanding and acceptance of the Stockton '
            'Esports Media Agreement & Release.',
        ], step_label='Review & Sign', icon='fa-signature'),
        _field('ack_final', 'acknowledge',
               'I acknowledge and agree to the statements above.',
               title='Final Acknowledgement', required=True,
               description=['By submitting this form, I confirm that:'],
               items=[
                   'I have read and understand the Stockton Esports Media Agreement & Release.',
                   'I understand how Stockton Esports and Stockton University may capture and '
                   'use media involving me.',
                   'The information I provided is accurate and complete.',
                   'I voluntarily provide the permissions described in the agreement.',
                   'I understand that I may revoke my authorization in writing for future use.',
                   'I understand that revocation does not require Stockton Esports or Stockton '
                   'University to remove media that was previously published or distributed.',
                   'I understand that this agreement applies to my participation in Stockton '
                   'Esports.',
               ]),
        _field('signature', 'signature', 'Digital Signature (Full Legal Name)', required=True,
               max_length=150,
               help='Typing your full legal name serves as your electronic signature.'),
        _field('signed_date', 'date_auto', 'Date of Signature', required=True),
    ],
}

# contract_key -> {version: definition}. The highest version is the one new signers get.
FORMS = {
    'leadership_agreement': {1: LEADERSHIP_AGREEMENT_V1},
    'player_agreement': {1: PLAYER_AGREEMENT_V1},
    'media_agreement': {1: MEDIA_AGREEMENT_V1},
}


DEFAULT_STEP_ICON = 'fa-file-lines'


def with_steps(form):
    """
    Split a form into wizard steps. Every main-level section that has a heading
    starts a new step, and the blocks after it (its sub-sections, fields and
    acknowledgements) belong to that step. Blocks before the first heading
    (an unheaded intro) are shown at the top of step 1.

    Returns a copy of the definition (the FORMS constants are never modified) with:
      steps  - [{'label', 'icon'}, ...]; label is the section's step_label, else its heading
      blocks - the same blocks, each tagged with the index of its step
    """
    steps, blocks = [], []
    for block in form['blocks']:
        starts_step = (block['type'] == 'section' and block['level'] == 'main'
                       and block.get('heading'))
        if starts_step:
            steps.append({'label': block.get('step_label') or block['heading'],
                          'icon': block.get('icon') or DEFAULT_STEP_ICON})
        blocks.append({**block, 'step': max(len(steps) - 1, 0)})

    if not steps:   # a form with no headed sections is a single step
        steps.append({'label': form['title'], 'icon': DEFAULT_STEP_ICON})

    return {**form, 'steps': steps, 'blocks': blocks}


def get_form(contract_key, version=None):
    """The form definition for a contract (latest version unless one is requested), split into steps."""
    versions = FORMS.get(contract_key)
    if not versions:
        return None
    if version in versions:
        return with_steps(versions[version])
    return with_steps(versions[max(versions)])

def get_season_name(cursor, season_id):
    """The display name of a season ('' if it has none)."""
    cursor.execute("SELECT season_name FROM seasons WHERE season_id = %s", (season_id,))
    row = cursor.fetchone() or {}
    return (row.get('season_name') or '').strip()



def apply_season_name(form, season_name):
    """Replace {season} throughout the entire form definition."""

    def fill(value):
        if isinstance(value, str):
            return value.replace('{season}', season_name)
        elif isinstance(value, list):
            return [fill(item) for item in value]
        elif isinstance(value, tuple):
            return tuple(fill(item) for item in value)
        elif isinstance(value, dict):
            return {key: fill(item) for key, item in value.items()}
        return value

    return fill(form)



# =====================================
# VALIDATION
# =====================================
def validate_responses(form, data, prefill):
    """
    Check submitted answers against a form definition.

    Returns (clean_responses, errors, signed_name):
      clean_responses - only fields the form defines, normalized, safe to store
      errors          - {field_key: message}; empty when valid
      signed_name     - the typed signature (for the signed_name column) or None

    Read-only fields are always taken from the account (prefill), never from
    the client, and the signature date is always set by the server.
    """
    clean, errors, signed_name = {}, {}, None

    if not isinstance(data, dict):
        return clean, {'_form': 'Invalid submission.'}, None

    for block in form['blocks']:
        if block['type'] != 'field':
            continue

        # A conditional field only counts while its controlling answer matches
        condition = block.get('show_if')
        if condition and data.get(condition['field']) != condition['equals']:
            continue

        key, kind = block['key'], block['kind']
        required = block.get('required', False)
        raw = data.get(key)

        if kind in ('text', 'signature'):
            if block.get('readonly'):
                value = str(prefill.get(block.get('prefill'), '') or '')
            else:
                value = raw.strip() if isinstance(raw, str) else ''

            if required and not value:
                errors[key] = 'This field is required.'
                continue
            if len(value) > block.get('max_length', 200):
                errors[key] = f"Must be {block.get('max_length', 200)} characters or fewer."
                continue
            pattern = block.get('pattern')
            if value and pattern and not re.fullmatch(pattern, value):
                errors[key] = block.get('pattern_message', 'Invalid format.')
                continue

            if block.get('uppercase'):
                value = value.upper()
            clean[key] = value
            if kind == 'signature' and not block.get('secondary'):
                signed_name = value

        elif kind == 'radio':
            value = raw if isinstance(raw, str) else ''
            allowed = list(block['options']) + (['Other'] if block.get('allow_other') else [])

            if value not in allowed:
                if required:
                    errors[key] = 'Please select an option.'
                continue

            clean[key] = value
            if value == 'Other':
                other = data.get(f'{key}_other')
                other = other.strip() if isinstance(other, str) else ''
                if not other:
                    errors[key] = 'Please specify.'
                    continue
                if len(other) > 100:
                    errors[key] = 'Must be 100 characters or fewer.'
                    continue
                clean[f'{key}_other'] = other

        elif kind == 'checkbox_group':
            selected = raw if isinstance(raw, list) else []
            chosen = [opt for opt in block['options'] if opt in selected]   # drops unknown values
            if required and not chosen:
                errors[key] = 'Please select at least one option.'
                continue
            clean[key] = chosen

        elif kind == 'acknowledge':
            if raw is True:
                clean[key] = True
            elif required:
                errors[key] = 'You must agree to continue.'
            else:
                clean[key] = False

        elif kind == 'date_auto':
            clean[key] = today_est().isoformat()

    return clean, errors, signed_name


# =====================================
# ACCESS + COMPLETION
# =====================================
def get_contract_access(cursor, user_id: int):
    """
    Returns (season_id, accessible_keys) for the active season: the contract
    keys this user may currently fill out.
    """
    # Seasons are flagged is_active as soon as they're created, which can be
    # before their start_date, so "has begun" is checked separately.
    cursor.execute("SELECT season_id, start_date FROM seasons WHERE is_active = 1 LIMIT 1")
    active_season = cursor.fetchone()
    season_id = active_season['season_id'] if active_season else None
    season_started = bool(active_season) and active_season['start_date'] <= today_est()

    on_team = False
    is_leadership = False

    if season_id:
        # Player-focused contracts: assigned to at least one team this season
        cursor.execute("""
            SELECT 1
            FROM team_members tm
            JOIN teams t ON tm.team_id = t.TeamID
            WHERE tm.user_id = %s AND t.season_id = %s
            LIMIT 1
        """, (user_id, season_id))
        on_team = cursor.fetchone() is not None

    if season_started:
        # Leadership contracts: admin or GM (custom roles are stored as is_gm = 1)
        cursor.execute("""
            SELECT 1
            FROM season_roles
            WHERE userid = %s AND season_id = %s AND (is_admin = 1 OR is_gm = 1)
            LIMIT 1
        """, (user_id, season_id))
        is_leadership = cursor.fetchone() is not None

    audience_access = {
        'everyone': True,
        'player': on_team,
        'leadership': is_leadership,
    }
    accessible = [c['key'] for c in CONTRACT_TYPES if audience_access.get(c['audience'], False)]
    return season_id, accessible


def get_available_contracts(cursor, user_id: int) -> list[dict]:
    """
    Contracts the user can access, as [{'key', 'label', 'completed'}, ...]
    in display order. 'completed' = a submission exists for the active season.
    """
    season_id, accessible = get_contract_access(cursor, user_id)

    completed = set()
    if season_id and accessible:
        cursor.execute("""
            SELECT contract_key
            FROM contract_submissions
            WHERE user_id = %s AND season_id = %s
        """, (user_id, season_id))
        completed = {row['contract_key'] for row in cursor.fetchall()}

    return [
        {'key': key, 'label': CONTRACT_LABELS[key], 'completed': key in completed}
        for key in accessible
    ]


def fetch_submission(cursor, user_id, season_id, contract_key):
    cursor.execute("""
        SELECT id, form_version, signed_name, responses, submitted_at
        FROM contract_submissions
        WHERE user_id = %s AND season_id = %s AND contract_key = %s
        LIMIT 1
    """, (user_id, season_id, contract_key))
    return cursor.fetchone()


def parse_responses(raw):
    """MySQLdb returns JSON columns as text; turn it back into a dict."""
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode('utf-8')
    if isinstance(raw, str):
        return json.loads(raw)
    return raw or {}


def get_prefill(cursor, user_id):
    """Account details used to pre-fill forms."""
    cursor.execute("SELECT firstname, lastname, email FROM users WHERE id = %s", (user_id,))
    user = cursor.fetchone() or {}
    return {
        'email': user.get('email') or '',
        'full_name': f"{user.get('firstname', '')} {user.get('lastname', '')}".strip(),
    }


def format_display_date(value):
    return f"{value.strftime('%B')} {value.day}, {value.year}"


# =====================================
# ROUTES
# =====================================
def register_contract_routes(app, mysql, login_required):
    """Register all contract routes. Called from __init__.py."""

    @app.route('/api/contracts/available')
    @login_required
    def api_available_contracts():
        """Contracts the current user can open (feeds the profile flyout)."""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            contracts = get_available_contracts(cursor, session['id'])
            return jsonify({'contracts': contracts})
        finally:
            cursor.close()

    @app.route('/api/contracts/<contract_key>/form')
    @login_required
    def api_contract_form(contract_key):
        """
        Everything the modal needs: the form definition, pre-fill values and,
        if the user already signed it, their submission (shown read-only).
        """
        if contract_key not in FORMS:
            return jsonify({'success': False, 'message': "This form isn't available yet."}), 404

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            user_id = session['id']
            season_id, accessible = get_contract_access(cursor, user_id)

            if not season_id:
                return jsonify({'success': False, 'message': 'There is no active season.'}), 403

            row = fetch_submission(cursor, user_id, season_id, contract_key)

            # A signed form can always be viewed by its signer; filling one out needs access
            if not row and contract_key not in accessible:
                return jsonify({'success': False,
                                'message': 'This form is not available to you right now.'}), 403

            submission = None
            if row:
                submission = {
                    'responses': parse_responses(row['responses']),
                    'signed_name': row['signed_name'],
                    'submitted_display': format_display_date(row['submitted_at']),
                }

            return jsonify({
                'success': True,
                'form': apply_season_name(
                    get_form(contract_key, row['form_version'] if row else None),
                    get_season_name(cursor, season_id)),
                'prefill': get_prefill(cursor, user_id),
                'signed_date': today_est().isoformat(),
                'submission': submission,
            })
        except Exception as e:
            print(f"Error loading contract form: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to load this form.'}), 500
        finally:
            cursor.close()

    @app.route('/api/contracts/<contract_key>/submit', methods=['POST'])
    @login_required
    def api_submit_contract(contract_key):
        """Validate and save a signed contract for the active season."""
        form = get_form(contract_key)
        if not form:
            return jsonify({'success': False, 'message': "This form isn't available yet."}), 404

        payload = request.get_json(silent=True) or {}
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            user_id = session['id']
            season_id, accessible = get_contract_access(cursor, user_id)

            if not season_id or contract_key not in accessible:
                return jsonify({'success': False,
                                'message': 'This form is not available to you right now.'}), 403

            if fetch_submission(cursor, user_id, season_id, contract_key):
                return jsonify({'success': False,
                                'message': 'You have already submitted this form this season.'}), 409

            clean, errors, signed_name = validate_responses(
                form, payload.get('responses'), get_prefill(cursor, user_id)
            )
            if errors:
                return jsonify({'success': False,
                                'message': 'Please fix the highlighted fields.',
                                'errors': errors}), 400

            cursor.execute("""
                INSERT INTO contract_submissions
                    (user_id, season_id, contract_key, form_version, signed_name, responses)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (user_id, season_id, contract_key, form['version'], signed_name,
                  json.dumps(clean)))
            mysql.connection.commit()

            return jsonify({'success': True,
                            'message': f'{CONTRACT_LABELS[contract_key]} signed and submitted.'})

        except MySQLdb.IntegrityError:
            # Unique key caught a double-submit that slipped past the check above
            mysql.connection.rollback()
            return jsonify({'success': False,
                            'message': 'You have already submitted this form this season.'}), 409
        except Exception as e:
            mysql.connection.rollback()
            print(f"Error submitting contract: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to submit this form.'}), 500
        finally:
            cursor.close()


    @app.route('/api/contracts/<contract_key>/validate-step', methods=['POST'])
    @login_required
    def api_validate_contract_step(contract_key):
        """
        Validate one step of a form (the wizard's "Continue"). Nothing is saved: this
        runs the same rules as the final submit, limited to that step's fields.
        """
        form = get_form(contract_key)
        if not form:
            return jsonify({'success': False, 'message': "This form isn't available yet."}), 404

        payload = request.get_json(silent=True) or {}
        step = payload.get('step')
        if not isinstance(step, int) or isinstance(step, bool) or not 0 <= step < len(form['steps']):
            return jsonify({'success': False, 'message': 'Invalid step.'}), 400

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            user_id = session['id']
            season_id, accessible = get_contract_access(cursor, user_id)

            if not season_id or contract_key not in accessible:
                return jsonify({'success': False,
                                'message': 'This form is not available to you right now.'}), 403

            step_form = {'blocks': [b for b in form['blocks'] if b['step'] == step]}
            _, errors, _ = validate_responses(
                step_form, payload.get('responses'), get_prefill(cursor, user_id)
            )
            if errors:
                return jsonify({'success': False,
                                'message': 'Please fix the highlighted fields.',
                                'errors': errors}), 400

            return jsonify({'success': True})
        except Exception as e:
            print(f"Error validating contract step: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to check this step.'}), 500
        finally:
            cursor.close()