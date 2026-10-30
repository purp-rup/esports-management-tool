/* ============================================================================
 * Contracts
 * - Profile kebab menu: "Contracts/Forms" flyout (lists the contracts the current
 *   user can access; opens beside the menu on desktop, expands inline on mobile)
 * - Contract modal: builds a stepped form from the server's definition, submits
 *   it, and shows signed forms read-only. Validation happens on the server; this
 *   file only displays its errors.
 * - Dashboard reminder card for contracts the user still has to fill out
 *
 * Server API (contracts.py):
 *   GET  /api/contracts/available            contracts for the flyout
 *   GET  /api/contracts/reminders            unfilled contracts for the reminder card
 *   GET  /api/contracts/<key>/form           form definition (+ submission if signed)
 *   POST /api/contracts/<key>/validate-step  check one step before moving on
 *   POST /api/contracts/<key>/submit         sign and submit the whole form
 *   POST /api/contracts/<key>/visit          record a visit to a link-type contract
 *
 * Depends on:
 *   universal-helpers.js  initFlyoutTriggers, positionFlyout, closeAllFilterPanels,
 *                         lockBodyScroll, unlockBodyScroll, escapeHtml
 *   toast helpers         window.showSuccessToast, window.showErrorToast
 *   window.NotificationQueue (stacks the reminder card)
 * ============================================================================
 */

let contractsLoaded = false;
let contractsLoading = false;
let availableContracts = [];

/** Set while a form is open: { key, form, readOnly, step, reached, errorSteps } */
let activeContract = null;
let contractRequestId = 0;   // guards against a slow response landing after the modal was closed

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    setupContractsFlyout();
    document.getElementById('contractForm')?.addEventListener('submit', submitContractForm);
    document.getElementById('contractFormBody')?.addEventListener('change', updateContractVisibility);
    loadContractReminder();
});

function setupContractsFlyout() {
    const trigger = document.getElementById('contractsFlyoutTrigger');
    const flyout = document.getElementById('contractsFlyout');
    if (!trigger || !flyout) return;

    // Hover placement, scroll tracking and the mobile expand/collapse come from the shared helper
    initFlyoutTriggers(trigger.parentElement);

    // Load the list on first hover (desktop) or tap (mobile). The arrow function matters:
    // passing the handler directly would hand the event in as `force`.
    ['mouseenter', 'click'].forEach(type => trigger.addEventListener(type, () => loadContractsFlyout()));

    // Event delegation, so re-rendering the list is safe
    flyout.addEventListener('click', (e) => {
        const item = e.target.closest('[data-contract-key]');
        if (!item) return;
        e.stopPropagation();   // keep the click from toggling the mobile accordion

        const contract = availableContracts.find(c => c.key === item.dataset.contractKey);
        if (contract?.link) visitContractLink(contract);
        else openContractForm(item.dataset.contractKey);
    });
}

/** Collapse the mobile accordion and close any open filter panel. */
function closeContractsMenu() {
    document.getElementById('contractsFlyoutTrigger')?.classList.remove('flyout-expanded');
    closeAllFilterPanels();
}

// ============================================
// API
// ============================================
function contractUrl(key, action) {
    return `/api/contracts/${encodeURIComponent(key)}/${action}`;
}

/**
 * Call a per-contract endpoint and resolve to { response, data } (data = parsed JSON).
 * Passing a body makes it a JSON POST; without one it's a GET.
 */
async function contractRequest(key, action, body) {
    const response = await fetch(contractUrl(key, action), body === undefined ? undefined : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return { response, data: await response.json() };
}

function contractToast(message, isError = false) {
    const toast = isError ? window.showErrorToast : window.showSuccessToast;
    if (typeof toast === 'function') toast(message);
}

// ============================================
// FLYOUT
// ============================================

/**
 * Fetch the contracts available to the current user and render them. Runs once
 * per page load; pass force = true to refresh (e.g. after a submit). A failed
 * load is retried on the next hover/tap.
 */
async function loadContractsFlyout(force = false) {
    if (contractsLoading || (contractsLoaded && !force)) return;
    contractsLoading = true;

    try {
        const response = await fetch('/api/contracts/available');
        if (!response.ok) throw new Error(`Request failed (${response.status})`);

        availableContracts = (await response.json()).contracts || [];
        renderContractsFlyout(availableContracts);
        contractsLoaded = true;
    } catch (error) {
        console.error('Error loading contracts:', error);
        renderContractsFlyoutMessage('Unable to load contracts');
    } finally {
        contractsLoading = false;

        // Content height changed: re-place the flyout if it's showing
        const trigger = document.getElementById('contractsFlyoutTrigger');
        if (trigger?.matches(':hover')) positionFlyout(trigger);
    }
}

function renderContractsFlyout(contracts) {
    const flyout = document.getElementById('contractsFlyout');
    if (!flyout) return;

    if (!contracts.length) {
        renderContractsFlyoutMessage('No contracts available');
        return;
    }

    flyout.replaceChildren(...contracts.map(contract => {
        const item = contractEl('div', 'filter-box-flyout-item');
        item.dataset.contractKey = contract.key;

        const label = contractEl('span', '', contract.label);
        if (contract.link) {
            // Opens another site: small arrow after the label
            const external = contractEl('i', 'fas fa-arrow-up-right-from-square contract-link-icon');
            external.setAttribute('aria-hidden', 'true');
            label.append(' ', external);
        }
        item.appendChild(label);

        if (contract.completed) {
            item.classList.add('is-complete');
            const check = contractEl('i', 'fas fa-check contract-complete-icon');
            check.title = 'Completed';
            check.setAttribute('aria-label', 'Completed');
            item.appendChild(check);
        }
        return item;
    }));
}

function renderContractsFlyoutMessage(message) {
    document.getElementById('contractsFlyout')
        ?.replaceChildren(contractEl('div', 'filter-box-flyout-loading', message));
}

// ============================================
// CONTRACT MODAL
// ============================================

/** Open the modal with the fillable form, or the signed copy (read-only) if already submitted. */
async function openContractForm(contractKey) {
    closeContractsMenu();

    const requestId = ++contractRequestId;
    showContractModalLoading();
    openContractModal();

    try {
        const { response, data } = await contractRequest(contractKey, 'form');
        if (requestId !== contractRequestId) return;   // modal was closed while loading

        if (!response.ok || !data.success) {
            closeContractModal();
            contractToast(data.message || 'Unable to open this form.', true);
            return;
        }
        showContractForm(contractKey, data);
    } catch (error) {
        console.error('Error opening contract:', error);
        if (requestId !== contractRequestId) return;
        closeContractModal();
        contractToast('An error occurred. Please try again.', true);
    }
}

/**
 * Link-type option (e.g. Qualtrics): open the site, then record that the person went.
 * The tab opens first, straight from the click, so browsers don't treat it as a popup.
 * The visit is recorded once; later clicks just reopen the site.
 */
async function visitContractLink(contract) {
    closeContractsMenu();
    window.open(contract.link, '_blank', 'noopener');
    if (contract.completed) return;

    try {
        const response = await fetch(contractUrl(contract.key, 'visit'), { method: 'POST' });
        if (response.ok) loadContractsFlyout(true);   // refresh so the check mark shows
    } catch (error) {
        console.error('Error recording link visit:', error);
    }
}

function openContractModal() {
    document.getElementById('contractModal').style.display = 'flex';
    lockBodyScroll('contractModal');
}

function closeContractModal() {
    contractRequestId++;   // invalidate any in-flight load
    activeContract = null;

    document.getElementById('contractModal').style.display = 'none';
    document.getElementById('contractFormBody').replaceChildren();
    unlockBodyScroll('contractModal');
}

/** Show or hide an element by id. `display` is the value used when shown ('' = stylesheet default). */
function setContractVisible(id, visible, display = '') {
    document.getElementById(id).style.display = visible ? display : 'none';
}

function showContractModalLoading() {
    document.getElementById('contractModalTitle').textContent = 'Loading...';
    setContractVisible('contractModalLoading', true, 'flex');
    ['contractModalSubtitle', 'contractSignedBanner', 'contractProgress', 'contractForm', 'contractFooter']
        .forEach(id => setContractVisible(id, false));
}

function showContractForm(contractKey, data) {
    const { form, submission } = data;
    const readOnly = Boolean(submission);
    activeContract = {
        key: contractKey,
        form,
        readOnly,
        step: 0,
        reached: readOnly ? form.steps.length : 0,   // furthest step the person can jump to (a signed form is fully open)
        errorSteps: new Set()                        // steps holding a server-reported error
    };

    // A signed form shows exactly what was signed; a new one starts from the account's details
    const values = readOnly
        ? { ...submission.responses }
        : { ...data.prefill, signed_date: data.signed_date };

    document.getElementById('contractModalTitle').textContent = form.title;

    const subtitle = document.getElementById('contractModalSubtitle');
    subtitle.textContent = form.subtitle || '';
    setContractVisible('contractModalSubtitle', Boolean(form.subtitle));

    renderContractForm(form, values, readOnly);

    const banner = document.getElementById('contractSignedBanner');
    banner.replaceChildren();
    if (readOnly) {
        const verb = form.requires_signature === false ? 'Submitted' : 'Signed';
        banner.append(contractEl('i', 'fas fa-check-circle'), ` ${verb} on ${submission.submitted_display}`);
    }
    setContractVisible('contractSignedBanner', readOnly, 'block');

    setContractSubmitting(false);
    setContractVisible('contractModalLoading', false);
    setContractVisible('contractForm', true);     // '' lets .event-form-modal's own layout apply
    setContractVisible('contractFooter', true);
    goToContractStep(0);
}

// ============================================
// STEPS (progress indicator, footer, navigation)
// ============================================

/** Show one step's panel and bring the progress indicator and footer in line with it. */
function goToContractStep(index) {
    if (!activeContract) return;

    const last = activeContract.form.steps.length - 1;
    const step = activeContract.step = Math.min(Math.max(index, 0), last);

    document.querySelectorAll('#contractFormBody .contract-step').forEach(panel => {
        panel.hidden = Number(panel.dataset.step) !== step;
    });

    renderContractProgress();
    updateContractFooter();
    document.querySelector('#contractModal .modal-body').scrollTop = 0;
}

function renderContractProgress() {
    const { form: { steps }, step, reached, errorSteps } = activeContract;

    // A single-step form needs no indicator
    setContractVisible('contractProgress', steps.length > 1);

    document.getElementById('contractStepCaption').textContent =
        `Step ${step + 1} of ${steps.length} \u2014 ${steps[step].label}`;
    document.getElementById('contractProgressFill').style.width =
        `${((step + 1) / steps.length) * 100}%`;

    document.getElementById('contractStepper').replaceChildren(...steps.map((meta, i) => {
        const hasError = errorSteps.has(i) && i !== step;
        const isDone = i < reached && i !== step && !hasError;

        const dot = contractEl('button', 'contract-step-dot');
        dot.type = 'button';
        dot.disabled = i > reached;   // later steps unlock as each one is completed
        dot.title = meta.label;
        dot.setAttribute('aria-label', `Step ${i + 1}: ${meta.label}`);
        dot.classList.toggle('is-current', i === step);
        dot.classList.toggle('is-done', isDone);
        dot.classList.toggle('has-error', hasError);
        if (i === step) dot.setAttribute('aria-current', 'step');

        if (isDone) dot.appendChild(contractEl('i', 'fas fa-check'));
        else dot.textContent = String(i + 1);

        dot.addEventListener('click', () => goToContractStep(i));
        return dot;
    }));
}

function updateContractFooter() {
    const { form, step, readOnly } = activeContract;
    const isLast = step === form.steps.length - 1;

    // Left button leaves the modal on the first step, otherwise steps back
    const left = document.getElementById('contractCancelBtn');
    left.replaceChildren();
    if (step === 0) left.textContent = readOnly ? 'Close' : 'Cancel';
    else left.append(contractEl('i', 'fas fa-arrow-left'), ' Back');

    // Right button: Continue / Next on the way through, Sign & Submit (or Close) at the end
    const right = document.getElementById('contractSubmitBtnText');
    right.replaceChildren();
    if (isLast) right.textContent = readOnly ? 'Close' : (form.requires_signature === false ? 'Submit' : 'Sign & Submit');
    else right.append(readOnly ? 'Next ' : 'Continue ', contractEl('i', 'fas fa-arrow-right'));
}

function contractBack() {
    if (!activeContract || activeContract.step === 0) closeContractModal();
    else goToContractStep(activeContract.step - 1);
}

// ============================================
// FORM RENDERING (from the server's form definition)
// ============================================
function contractEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/** Class for the "required" marker on legends and acknowledgement titles. */
const contractRequired = (field) => field.required ? 'contract-required' : '';

/** Mark a section/field that only appears when a radio question has a given answer. */
function markContractConditional(node, block) {
    if (!block.show_if) return;
    node.classList.add('contract-conditional');
    node.dataset.showIfField = block.show_if.field;
    node.dataset.showIfEquals = block.show_if.equals;
}

/** Show or hide every conditional block based on the current radio answers. */
function updateContractVisibility() {
    const root = document.getElementById('contractFormBody');
    root.querySelectorAll('.contract-conditional').forEach(node => {
        const checked = root.querySelector(`input[type="radio"][name="${node.dataset.showIfField}"]:checked`);
        node.hidden = checked?.value !== node.dataset.showIfEquals;
    });
}

function renderContractForm(form, values, readOnly) {
    const body = document.getElementById('contractFormBody');

    // One panel per step. All stay in the DOM (only one is visible), so answers
    // survive moving between steps and collect/error code still sees every field.
    body.replaceChildren(...form.steps.map((meta, index) => {
        const panel = contractEl('div', 'contract-step');
        panel.dataset.step = index;
        panel.hidden = index !== 0;

        form.blocks.filter(block => block.step === index).forEach(block => {
            panel.appendChild(
                block.type === 'section'
                    ? renderContractSection(block, meta)
                    : renderContractField(block, values, readOnly)
            );
        });
        return panel;
    }));

    updateContractVisibility();
}

function renderContractSection(block, stepMeta) {
    const isSub = block.level === 'sub';
    const isStepHead = !isSub && Boolean(block.heading);   // the heading that opens a step
    const variant = isSub ? 'contract-section--sub' : isStepHead ? 'contract-step-head' : 'contract-lead';
    const wrap = contractEl('div', `contract-section ${variant}`);

    if (block.heading) {
        const title = contractEl(isSub ? 'h4' : 'h3', 'contract-section-title');
        if (isStepHead) title.appendChild(contractEl('i', `fas ${stepMeta.icon} contract-step-icon`));
        title.append(block.heading);
        wrap.appendChild(title);
    }
    (block.paragraphs || []).forEach(text => wrap.appendChild(contractEl('p', 'contract-text', text)));
    if (block.items?.length) wrap.appendChild(renderContractList(block.items));
    markContractConditional(wrap, block);
    return wrap;
}

function renderContractList(items) {
    const list = contractEl('ul', 'contract-list');
    items.forEach(text => list.appendChild(contractEl('li', '', text)));
    return list;
}

/** Appends the field's controls to `group`, by kind (signature shares the text renderer). */
const CONTRACT_FIELD_RENDERERS = {
    text: appendContractTextField,
    signature: appendContractTextField,
    date_auto: appendContractDateField,
    radio: appendContractRadioField,
    checkbox_group: appendContractCheckboxField,
    acknowledge: appendContractAcknowledgeField
};

function renderContractField(field, values, readOnly) {
    const group = contractEl('div', 'form-group contract-field');
    group.dataset.fieldKey = field.key;
    CONTRACT_FIELD_RENDERERS[field.kind]?.(group, field, values, readOnly);
    markContractConditional(group, field);
    return group;
}

function createContractLabel(forId, text, required) {
    return Object.assign(contractEl('label', required ? 'required-field' : '', text), { htmlFor: forId });
}

/** Text input; `props` are set as DOM properties (id, name, value, maxLength, ...). */
function createContractTextInput(props) {
    return Object.assign(contractEl('input'), { type: 'text', ...props });
}

/** Wrap an input with the padlock icon used for fields the person can't edit. */
function lockContractInput(input) {
    const wrap = contractEl('div', 'input-with-icon');
    wrap.append(input, contractEl('i', 'fas fa-lock input-lock-icon'));
    return wrap;
}

function createContractFieldset(field) {
    const fieldset = contractEl('fieldset', 'contract-fieldset');
    fieldset.appendChild(contractEl('legend', contractRequired(field), field.label));
    if (field.help) fieldset.appendChild(contractEl('small', 'contract-help', field.help));
    return fieldset;
}

function appendContractTextField(group, field, values, readOnly) {
    const id = `contractField_${field.key}`;
    group.appendChild(createContractLabel(id, field.label, field.required));

    // Signature instructions read better above the input; other hints sit below it
    const help = field.help ? contractEl('small', 'contract-help', field.help) : null;
    const helpFirst = field.kind === 'signature';
    if (help && helpFirst) group.appendChild(help);

    const input = createContractTextInput({
        id,
        name: field.key,
        autocomplete: 'off',
        maxLength: field.max_length || 200,
        value: values[field.key] ?? '',
        readOnly: readOnly || Boolean(field.readonly)
    });
    group.appendChild(field.readonly ? lockContractInput(input) : input);

    if (help && !helpFirst) group.appendChild(help);
}

function appendContractDateField(group, field, values) {
    const id = `contractField_${field.key}`;
    group.appendChild(createContractLabel(id, field.label, true));

    // Display only: the server sets the real date when the form is submitted
    const date = values[field.key];
    group.appendChild(lockContractInput(createContractTextInput({
        id,
        readOnly: true,
        value: date ? formatContractDate(date) : ''
    })));
}

function appendContractRadioField(group, field, values, readOnly) {
    const fieldset = createContractFieldset(field);
    field.options.forEach(option => {
        fieldset.appendChild(createContractChoice('radio', field.key, option, values[field.key] === option, readOnly));
    });

    if (field.allow_other) {
        const row = createContractChoice('radio', field.key, 'Other', values[field.key] === 'Other', readOnly, 'Other:');
        const radio = row.querySelector('input');

        const otherInput = createContractTextInput({
            className: 'contract-other-input',
            name: `${field.key}_other`,
            maxLength: 100,
            autocomplete: 'off',
            value: values[`${field.key}_other`] ?? '',
            disabled: readOnly || !radio.checked
        });
        row.appendChild(otherInput);

        // The write-in only works while "Other" is the selected option
        fieldset.addEventListener('change', () => {
            otherInput.disabled = readOnly || !radio.checked;
            if (!otherInput.disabled && document.activeElement === radio) otherInput.focus();
        });

        fieldset.appendChild(row);
    }

    group.appendChild(fieldset);
}

function appendContractCheckboxField(group, field, values, readOnly) {
    const fieldset = createContractFieldset(field);
    const selected = Array.isArray(values[field.key]) ? values[field.key] : [];
    field.options.forEach(option => {
        fieldset.appendChild(createContractChoice('checkbox', field.key, option, selected.includes(option), readOnly));
    });
    group.appendChild(fieldset);
}

function appendContractAcknowledgeField(group, field, values, readOnly) {
    group.classList.add('contract-ack');
    group.appendChild(contractEl('div', `contract-ack-title ${contractRequired(field)}`, field.title));
    (field.description || []).forEach(text => group.appendChild(contractEl('p', 'contract-text', text)));
    if (field.items?.length) group.appendChild(renderContractList(field.items));
    group.appendChild(createContractChoice('checkbox', field.key, 'agree', values[field.key] === true, readOnly, field.label));
}

function createContractChoice(type, name, value, checked, disabled, labelText) {
    const label = contractEl('label', 'contract-choice');
    label.append(
        Object.assign(contractEl('input'), { type, name, value, checked, disabled }),
        contractEl('span', '', labelText ?? value)
    );
    return label;
}

function formatContractDate(iso) {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
    });
}

// ============================================
// SUBMISSION
// ============================================

/** Read the current answers out of the rendered form, keyed by field. */
function collectContractResponses(form) {
    const root = document.getElementById('contractFormBody');
    const inputs = (name, state = '') => root.querySelectorAll(`input[name="${name}"]${state}`);
    const data = {};

    form.blocks.forEach(({ type, kind, key }) => {
        if (type !== 'field' || kind === 'date_auto') return;

        switch (kind) {
            case 'text':
            case 'signature':
                data[key] = inputs(key)[0].value;
                break;
            case 'radio': {
                const checked = inputs(key, ':checked')[0];
                data[key] = checked ? checked.value : '';
                if (checked?.value === 'Other') data[`${key}_other`] = inputs(`${key}_other`)[0].value;
                break;
            }
            case 'checkbox_group':
                data[key] = Array.from(inputs(key, ':checked'), input => input.value);
                break;
            case 'acknowledge':
                data[key] = inputs(key)[0].checked;
                break;
        }
    });

    return data;
}

async function submitContractForm(e) {
    e.preventDefault();
    if (!activeContract) return;

    const { form, step, readOnly } = activeContract;
    const isLast = step === form.steps.length - 1;

    // A signed form is only read: Next / Close, nothing to send
    if (readOnly) {
        if (isLast) closeContractModal();
        else goToContractStep(step + 1);
        return;
    }

    clearContractErrors();
    if (isLast) await submitContract();
    else await validateContractStep();
}

/**
 * POST the current answers to a contract endpoint. Resolves to the server's result
 * on success, or null on failure (after showing the errors and a toast, unless the
 * modal was closed in the meantime). Keeps the submit button busy while it runs.
 */
async function postContractResponses(action, extra, failMessage) {
    const contract = activeContract;
    setContractSubmitting(true);

    try {
        const { response, data } = await contractRequest(contract.key, action, {
            ...extra,
            responses: collectContractResponses(contract.form)
        });
        if (response.ok && data.success) return data;

        if (contract === activeContract) {
            if (data.errors) showContractErrors(data.errors);
            contractToast(data.message || failMessage, true);
        }
    } catch (error) {
        console.error(`Error calling contract ${action}:`, error);
        contractToast('An error occurred. Please try again.', true);
    } finally {
        setContractSubmitting(false);
    }
    return null;
}

/** "Continue": have the server check the current step before moving on. */
async function validateContractStep() {
    const contract = activeContract;
    const stepIndex = contract.step;

    const result = await postContractResponses('validate-step', { step: stepIndex }, 'Please fix the highlighted fields.');
    if (!result || contract !== activeContract) return;   // failed, or modal closed while checking

    contract.reached = Math.max(contract.reached, stepIndex + 1);
    goToContractStep(stepIndex + 1);
}

/** Last step: sign and submit the whole form. */
async function submitContract() {
    const contract = activeContract;

    const result = await postContractResponses('submit', {}, 'Failed to submit.');
    if (!result) return;

    contractToast(result.message || 'Submitted successfully!');
    if (contract === activeContract) closeContractModal();
    loadContractsFlyout(true);   // refresh so the new checkmark shows
}

function setContractSubmitting(isSubmitting) {
    document.getElementById('contractSubmitBtn').disabled = isSubmitting;
    setContractVisible('contractSubmitBtnText', !isSubmitting, 'inline');
    setContractVisible('contractSubmitBtnSpinner', isSubmitting, 'inline');
}

function showContractErrors(errors) {
    clearContractErrors();

    Object.entries(errors).forEach(([key, message]) => {
        const group = document.querySelector(`#contractFormBody [data-field-key="${key}"]`);
        if (!group) return;

        group.classList.add('has-error');
        group.appendChild(contractEl('div', 'contract-error', message));

        const panel = group.closest('.contract-step');
        if (panel && activeContract) activeContract.errorSteps.add(Number(panel.dataset.step));
    });

    // Errors can sit on any step: jump to the first one (in form order) and bring it into view
    const firstGroup = document.querySelector('#contractFormBody .has-error');
    if (firstGroup && activeContract) {
        goToContractStep(Number(firstGroup.closest('.contract-step').dataset.step));
        firstGroup.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function clearContractErrors() {
    activeContract?.errorSteps.clear();
    document.querySelectorAll('#contractFormBody .has-error').forEach(group => {
        group.classList.remove('has-error');
        group.querySelectorAll('.contract-error').forEach(node => node.remove());
    });
}

// ============================================
// DASHBOARD REMINDER CARD
// ============================================

/**
 * Persistent, dismissable card listing the contracts the user still has to fill
 * out. Stacked through NotificationQueue but never auto-dismissed. Dismissing
 * only closes it for this page load; it returns on the next load until every
 * listed contract is completed (nothing is stored server-side).
 * Static styling lives in contracts.css; only the slide animation is set here.
 */
function renderContractReminder(contracts) {
    const card = contractEl('div', 'contract-reminder-card');
    card.innerHTML = `
        <i class="fas fa-file-contract"></i>
        <div class="contract-reminder-body">
            <p>You've been assigned the following contract(s):</p>
            <ul>${contracts.map(c => `<li>${escapeHtml(c.label)}</li>`).join('')}</ul>
            <p>Please visit the '...' button on the Profile Tab to fill out all contracts. Thank you!</p>
        </div>
        <button type="button" class="contract-reminder-dismiss" aria-label="Dismiss">
            <i class="fas fa-times"></i>
        </button>
    `;

    // Slide in from / out to the right (the card starts off-screen in CSS)
    const slide = (visible) => {
        card.style.transform = visible ? 'translateX(0)' : 'translateX(400px)';
        card.style.opacity = visible ? '1' : '0';
    };

    document.body.appendChild(card);
    window.NotificationQueue.add(card);
    setTimeout(() => slide(true), 50);   // let the browser paint the off-screen state first

    card.querySelector('.contract-reminder-dismiss').addEventListener('click', () => {
        slide(false);
        setTimeout(() => {
            window.NotificationQueue.remove(card);
            card.remove();
        }, 300);   // matches the CSS transition
    });
}

/** On page load, show the reminder card if the user has unfilled contracts. */
async function loadContractReminder() {
    try {
        const response = await fetch('/api/contracts/reminders');
        if (!response.ok) throw new Error(`Request failed (${response.status})`);

        const { contracts = [] } = await response.json();
        if (contracts.length) renderContractReminder(contracts);
    } catch (error) {
        console.error('Failed to load contract reminders:', error);
    }
}

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================
window.loadContractsFlyout = loadContractsFlyout;
window.openContractForm = openContractForm;
window.closeContractModal = closeContractModal;
window.contractBack = contractBack;