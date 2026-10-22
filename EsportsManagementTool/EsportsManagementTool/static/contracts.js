/* ============================================================================
 * Contracts logic
 * - Profile kebab menu: "Contracts/Forms" flyout (loads the contracts the
 *   current user can access, opens left on desktop, expands inline on mobile)
 * - Contract modal: builds the form from the definition served by
 *   /api/contracts/<key>/form, submits it, and shows signed forms read-only.
 *   Validation happens on the server; this file only displays its errors.
 *
 * Depends on universal-helpers.js (closeAllFilterPanels, lockBodyScroll,
 * unlockBodyScroll) and the global toast helpers (showSuccessToast, showErrorToast).
 * ============================================================================
 */

const CONTRACTS_MOBILE_BREAKPOINT = 768;   // matches the site-wide mobile cutoff
const CONTRACTS_FLYOUT_GAP = 12;           // px between the kebab panel and the flyout

let contractsLoaded = false;
let contractsLoading = false;
let availableContracts = [];

let activeContract = null;     // { key, form, readOnly, step, reached, errorSteps } while a form is open
let contractRequestId = 0;     // guards against a slow response landing after the modal was closed

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    setupContractsFlyout();

    const contractForm = document.getElementById('contractForm');
    if (contractForm) contractForm.addEventListener('submit', submitContractForm);

    document.getElementById('contractFormBody')?.addEventListener('change', updateContractVisibility);
});

function setupContractsFlyout() {
    const trigger = document.getElementById('contractsFlyoutTrigger');
    const flyout = document.getElementById('contractsFlyout');
    if (!trigger || !flyout) return;

    // Desktop: hover opens the flyout (CSS) - load the list and place it to the left.
    // requestAnimationFrame lets our placement run after any other positioning logic.
    trigger.addEventListener('mouseenter', () => {
        loadContractsFlyout();
        requestAnimationFrame(() => positionContractsFlyout(trigger));
    });

    // Mobile: tap the row to expand/collapse the list inline
    trigger.addEventListener('click', (e) => {
        if (window.innerWidth > CONTRACTS_MOBILE_BREAKPOINT) return;
        if (e.target.closest('.contracts-flyout')) return;  // taps on an option are handled below

        e.stopPropagation();
        trigger.classList.toggle('flyout-expanded');
        loadContractsFlyout();
    });

    // Option selected (event delegation so re-rendering the list is safe)
    flyout.addEventListener('click', (e) => {
        const item = e.target.closest('[data-contract-key]');
        if (!item) return;
        e.stopPropagation();
        openContractForm(item.dataset.contractKey);
    });
}

// ============================================
// FLYOUT
// ============================================

/**
 * Always opens the flyout to the LEFT of the trigger (the kebab sits at the
 * far right of the card), clamped to the viewport. No-op on mobile, where the
 * list renders inline.
 */
function positionContractsFlyout(trigger) {
    const flyout = trigger.querySelector('.contracts-flyout');
    if (!flyout || window.innerWidth <= CONTRACTS_MOBILE_BREAKPOINT) return;

    const triggerRect = trigger.getBoundingClientRect();
    const flyoutRect = flyout.getBoundingClientRect();

    let left = triggerRect.left - flyoutRect.width - CONTRACTS_FLYOUT_GAP;
    let top = triggerRect.top - 6;

    left = Math.max(8, left);
    if (top + flyoutRect.height > window.innerHeight) {
        top = Math.max(8, window.innerHeight - flyoutRect.height - 8);
    }

    flyout.style.left = `${left}px`;
    flyout.style.top = `${top}px`;
}

/**
 * Fetch the contracts available to the current user and render them.
 * Runs once per page load; pass force = true to refresh (e.g. after a
 * form is submitted). A failed load is retried on the next hover/tap.
 */
async function loadContractsFlyout(force = false) {
    if (contractsLoading || (contractsLoaded && !force)) return;
    contractsLoading = true;

    try {
        const response = await fetch('/api/contracts/available');
        if (!response.ok) throw new Error(`Request failed (${response.status})`);

        const data = await response.json();
        availableContracts = data.contracts || [];
        renderContractsFlyout(availableContracts);
        contractsLoaded = true;
    } catch (error) {
        console.error('Error loading contracts:', error);
        renderContractsFlyoutMessage('Unable to load contracts');
    } finally {
        contractsLoading = false;

        // Content height changed - re-place the flyout if it's currently showing
        const trigger = document.getElementById('contractsFlyoutTrigger');
        if (trigger && trigger.matches(':hover')) positionContractsFlyout(trigger);
    }
}

function renderContractsFlyout(contracts) {
    const flyout = document.getElementById('contractsFlyout');
    if (!flyout) return;

    if (!contracts.length) {
        renderContractsFlyoutMessage('No contracts available');
        return;
    }

    flyout.replaceChildren();
    contracts.forEach(contract => {
        const item = document.createElement('div');
        item.className = 'filter-box-flyout-item';
        item.dataset.contractKey = contract.key;

        const label = document.createElement('span');
        label.textContent = contract.label;
        item.appendChild(label);

        if (contract.completed) {
            item.classList.add('is-complete');
            const check = document.createElement('i');
            check.className = 'fas fa-check contract-complete-icon';
            check.title = 'Signed';
            check.setAttribute('aria-label', 'Signed');
            item.appendChild(check);
        }

        flyout.appendChild(item);
    });
}

function renderContractsFlyoutMessage(message) {
    const flyout = document.getElementById('contractsFlyout');
    if (!flyout) return;

    const el = document.createElement('div');
    el.className = 'filter-box-flyout-loading';
    el.textContent = message;
    flyout.replaceChildren(el);
}

// ============================================
// CONTRACT MODAL
// ============================================

/**
 * Called when an option is picked from the flyout. Opens the modal with the
 * fillable form, or the signed copy (read-only) if it's already submitted.
 */
async function openContractForm(contractKey) {
    document.getElementById('contractsFlyoutTrigger')?.classList.remove('flyout-expanded');
    closeAllFilterPanels();

    const requestId = ++contractRequestId;
    showContractModalLoading();
    openContractModal();

    try {
        const response = await fetch(`/api/contracts/${encodeURIComponent(contractKey)}/form`);
        const data = await response.json();
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

function showContractModalLoading() {
    document.getElementById('contractModalTitle').textContent = 'Loading...';
    document.getElementById('contractModalSubtitle').style.display = 'none';
    document.getElementById('contractModalLoading').style.display = 'flex';
    document.getElementById('contractSignedBanner').style.display = 'none';
    document.getElementById('contractProgress').style.display = 'none';
    document.getElementById('contractForm').style.display = 'none';
    document.getElementById('contractFooter').style.display = 'none';
}

function showContractForm(contractKey, data) {
    const submission = data.submission;
    const readOnly = Boolean(submission);
    activeContract = {
        key: contractKey,
        form: data.form,
        readOnly,
        step: 0,
        reached: readOnly ? data.form.steps.length : 0,   // furthest step the person can jump to (a signed form is fully open)
        errorSteps: new Set()                             // steps holding a server-reported error
    };

    // A signed form shows exactly what was signed; a new one starts from the account's details
    const values = readOnly
        ? { ...submission.responses }
        : { ...data.prefill, signed_date: data.signed_date };

    document.getElementById('contractModalTitle').textContent = data.form.title;

    const subtitle = document.getElementById('contractModalSubtitle');
    subtitle.textContent = data.form.subtitle || '';
    subtitle.style.display = data.form.subtitle ? '' : 'none';

    renderContractForm(data.form, values, readOnly);

    const banner = document.getElementById('contractSignedBanner');
    if (readOnly) {
        banner.replaceChildren();
        const icon = contractEl('i', 'fas fa-check-circle');
        banner.append(icon, ` Signed on ${submission.submitted_display}`);
        banner.style.display = 'block';
    } else {
        banner.style.display = 'none';
    }

    setContractSubmitting(false);
    document.getElementById('contractModalLoading').style.display = 'none';
    document.getElementById('contractForm').style.display = '';   // '' lets .event-form-modal's own layout apply
    document.getElementById('contractFooter').style.display = '';
    goToContractStep(0);
}

// ============================================
// STEPS (progress indicator, footer, navigation)
// ============================================

/** Show one step's panel and bring the progress indicator and footer in line with it. */
function goToContractStep(index) {
    if (!activeContract) return;

    const last = activeContract.form.steps.length - 1;
    activeContract.step = Math.min(Math.max(index, 0), last);

    document.querySelectorAll('#contractFormBody .contract-step').forEach(panel => {
        panel.hidden = Number(panel.dataset.step) !== activeContract.step;
    });

    renderContractProgress();
    updateContractFooter();
    document.querySelector('#contractModal .modal-body').scrollTop = 0;
}

function renderContractProgress() {
    const { form, step, reached, errorSteps } = activeContract;
    const steps = form.steps;

    // A single-step form needs no indicator
    document.getElementById('contractProgress').style.display = steps.length > 1 ? '' : 'none';

    document.getElementById('contractStepCaption').textContent =
        `Step ${step + 1} of ${steps.length} \u2014 ${steps[step].label}`;
    document.getElementById('contractProgressFill').style.width =
        `${((step + 1) / steps.length) * 100}%`;

    const stepper = document.getElementById('contractStepper');
    stepper.replaceChildren();

    steps.forEach((meta, i) => {
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
        stepper.appendChild(dot);
    });
}

function updateContractFooter() {
    const { form, step, readOnly } = activeContract;
    const isLast = step === form.steps.length - 1;

    // Left button leaves the modal on the first step, otherwise steps back
    const left = document.getElementById('contractCancelBtn');
    left.replaceChildren();
    if (step === 0) {
        left.textContent = readOnly ? 'Close' : 'Cancel';
    } else {
        left.append(contractEl('i', 'fas fa-arrow-left'), ' Back');
    }

    // Right button: Continue / Next on the way through, Sign & Submit (or Close) at the end
    const label = document.getElementById('contractSubmitBtnText');
    label.replaceChildren();
    if (!isLast) {
        label.append(readOnly ? 'Next ' : 'Continue ', contractEl('i', 'fas fa-arrow-right'));
    } else {
        label.textContent = readOnly ? 'Close' : 'Sign & Submit';
    }
}

function contractBack() {
    if (!activeContract || activeContract.step === 0) {
        closeContractModal();
        return;
    }
    goToContractStep(activeContract.step - 1);
}

// ============================================
// FORM RENDERING (built from the server's form definition)
// ============================================
function contractEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

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
        node.hidden = !(checked && checked.value === node.dataset.showIfEquals);
    });
}

function renderContractForm(form, values, readOnly) {
    const body = document.getElementById('contractFormBody');
    body.replaceChildren();

    // One panel per step. They all stay in the DOM (only one is visible), so answers
    // survive moving between steps and the collect/error code still sees every field.
    form.steps.forEach((meta, index) => {
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

        body.appendChild(panel);
    });

    updateContractVisibility();
}

function renderContractSection(block, stepMeta) {
    const isSub = block.level === 'sub';
    const isStepHead = !isSub && Boolean(block.heading);   // the heading that opens a step

    let className = 'contract-section';
    if (isSub) className += ' contract-section--sub';
    else if (isStepHead) className += ' contract-step-head';
    else className += ' contract-lead';                    // unheaded intro text
    const wrap = contractEl('div', className);

    if (block.heading) {
        const title = contractEl(isSub ? 'h4' : 'h3', 'contract-section-title');
        if (isStepHead) title.appendChild(contractEl('i', `fas ${stepMeta.icon} contract-step-icon`));
        title.append(block.heading);
        wrap.appendChild(title);
    }
    (block.paragraphs || []).forEach(text => wrap.appendChild(contractEl('p', 'contract-text', text)));
    if (block.items && block.items.length) wrap.appendChild(renderContractList(block.items));
    markContractConditional(wrap, block);
    return wrap;
}

function renderContractList(items) {
    const list = contractEl('ul', 'contract-list');
    items.forEach(text => list.appendChild(contractEl('li', '', text)));
    return list;
}

function renderContractField(field, values, readOnly) {
    const group = contractEl('div', 'form-group contract-field');
    group.dataset.fieldKey = field.key;

    switch (field.kind) {
        case 'text':
        case 'signature':
            appendContractTextField(group, field, values, readOnly);
            break;
        case 'date_auto':
            appendContractDateField(group, field, values);
            break;
        case 'radio':
            appendContractRadioField(group, field, values, readOnly);
            break;
        case 'checkbox_group':
            appendContractCheckboxField(group, field, values, readOnly);
            break;
        case 'acknowledge':
            appendContractAcknowledgeField(group, field, values, readOnly);
            break;
    }
    markContractConditional(group, field);
    return group;
}

function appendContractTextField(group, field, values, readOnly) {
    const id = `contractField_${field.key}`;

    const label = contractEl('label', field.required ? 'required-field' : '', field.label);
    label.htmlFor = id;
    group.appendChild(label);

    // Signature instructions read better above the input; other hints sit below it
    const help = field.help ? contractEl('small', 'contract-help', field.help) : null;
    if (help && field.kind === 'signature') group.appendChild(help);

    const input = contractEl('input');
    input.type = 'text';
    input.id = id;
    input.name = field.key;
    input.autocomplete = 'off';
    input.maxLength = field.max_length || 200;
    input.value = values[field.key] ?? '';

    if (field.readonly) {
        input.readOnly = true;
        const wrap = contractEl('div', 'input-with-icon');
        wrap.appendChild(input);
        wrap.appendChild(contractEl('i', 'fas fa-lock input-lock-icon'));
        group.appendChild(wrap);
    } else {
        input.readOnly = readOnly;
        group.appendChild(input);
    }

    if (help && field.kind !== 'signature') group.appendChild(help);
}

function appendContractDateField(group, field, values) {
    const id = `contractField_${field.key}`;

    const label = contractEl('label', 'required-field', field.label);
    label.htmlFor = id;
    group.appendChild(label);

    // Display only - the server sets the real date when the form is submitted
    const input = contractEl('input');
    input.type = 'text';
    input.id = id;
    input.readOnly = true;
    input.value = values[field.key] ? formatContractDate(values[field.key]) : '';

    const wrap = contractEl('div', 'input-with-icon');
    wrap.appendChild(input);
    wrap.appendChild(contractEl('i', 'fas fa-lock input-lock-icon'));
    group.appendChild(wrap);
}

function appendContractRadioField(group, field, values, readOnly) {
    const fieldset = contractEl('fieldset', 'contract-fieldset');
    fieldset.appendChild(contractEl('legend', field.required ? 'contract-required' : '', field.label));

    field.options.forEach(option => {
        fieldset.appendChild(
            createContractChoice('radio', field.key, option, values[field.key] === option, readOnly)
        );
    });

    if (field.allow_other) {
        const row = createContractChoice('radio', field.key, 'Other', values[field.key] === 'Other', readOnly, 'Other:');
        const radio = row.querySelector('input');

        const otherInput = contractEl('input', 'contract-other-input');
        otherInput.type = 'text';
        otherInput.name = `${field.key}_other`;
        otherInput.maxLength = 100;
        otherInput.autocomplete = 'off';
        otherInput.value = values[`${field.key}_other`] ?? '';
        otherInput.disabled = readOnly || !radio.checked;
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
    const fieldset = contractEl('fieldset', 'contract-fieldset');
    fieldset.appendChild(contractEl('legend', field.required ? 'contract-required' : '', field.label));

    const selected = Array.isArray(values[field.key]) ? values[field.key] : [];
    field.options.forEach(option => {
        fieldset.appendChild(
            createContractChoice('checkbox', field.key, option, selected.includes(option), readOnly)
        );
    });

    group.appendChild(fieldset);
}

function appendContractAcknowledgeField(group, field, values, readOnly) {
    group.classList.add('contract-ack');

    group.appendChild(contractEl('div', field.required ? 'contract-ack-title contract-required' : 'contract-ack-title', field.title));
    (field.description || []).forEach(text => group.appendChild(contractEl('p', 'contract-text', text)));
    if (field.items && field.items.length) group.appendChild(renderContractList(field.items));

    group.appendChild(
        createContractChoice('checkbox', field.key, 'agree', values[field.key] === true, readOnly, field.label)
    );
}

function createContractChoice(type, name, value, checked, disabled, labelText) {
    const label = contractEl('label', 'contract-choice');

    const input = contractEl('input');
    input.type = type;
    input.name = name;
    input.value = value;
    input.checked = checked;
    input.disabled = disabled;

    label.append(input, contractEl('span', '', labelText ?? value));
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
    const data = {};

    form.blocks.forEach(block => {
        if (block.type !== 'field' || block.kind === 'date_auto') return;
        const key = block.key;

        switch (block.kind) {
            case 'text':
            case 'signature':
                data[key] = root.querySelector(`input[name="${key}"]`).value;
                break;
            case 'radio': {
                const checked = root.querySelector(`input[type="radio"][name="${key}"]:checked`);
                data[key] = checked ? checked.value : '';
                if (checked && checked.value === 'Other') {
                    data[`${key}_other`] = root.querySelector(`input[name="${key}_other"]`).value;
                }
                break;
            }
            case 'checkbox_group':
                data[key] = Array.from(
                    root.querySelectorAll(`input[type="checkbox"][name="${key}"]:checked`)
                ).map(input => input.value);
                break;
            case 'acknowledge':
                data[key] = root.querySelector(`input[name="${key}"]`).checked;
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

/** "Continue": have the server check the current step before moving on. */
async function validateContractStep() {
    const contract = activeContract;
    const stepIndex = contract.step;
    setContractSubmitting(true);

    try {
        const response = await fetch(`/api/contracts/${encodeURIComponent(contract.key)}/validate-step`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ step: stepIndex, responses: collectContractResponses(contract.form) })
        });
        const result = await response.json();
        if (contract !== activeContract) return;   // modal was closed while checking

        if (response.ok && result.success) {
            contract.reached = Math.max(contract.reached, stepIndex + 1);
            goToContractStep(stepIndex + 1);
        } else {
            if (result.errors) showContractErrors(result.errors);
            contractToast(result.message || 'Please fix the highlighted fields.', true);
        }
    } catch (error) {
        console.error('Error checking contract step:', error);
        contractToast('An error occurred. Please try again.', true);
    } finally {
        setContractSubmitting(false);
    }
}

/** Last step: sign and submit the whole form. */
async function submitContract() {
    const contract = activeContract;
    setContractSubmitting(true);

    try {
        const response = await fetch(`/api/contracts/${encodeURIComponent(contract.key)}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ responses: collectContractResponses(contract.form) })
        });
        const result = await response.json();

        if (response.ok && result.success) {
            contractToast(result.message || 'Submitted successfully!');
            if (contract === activeContract) closeContractModal();
            loadContractsFlyout(true);   // refresh so the new checkmark shows
        } else if (contract === activeContract) {
            if (result.errors) showContractErrors(result.errors);
            contractToast(result.message || 'Failed to submit.', true);
        }
    } catch (error) {
        console.error('Error submitting contract:', error);
        contractToast('An error occurred. Please try again.', true);
    } finally {
        setContractSubmitting(false);
    }
}

function setContractSubmitting(isSubmitting) {
    document.getElementById('contractSubmitBtn').disabled = isSubmitting;
    document.getElementById('contractSubmitBtnText').style.display = isSubmitting ? 'none' : 'inline';
    document.getElementById('contractSubmitBtnSpinner').style.display = isSubmitting ? 'inline' : 'none';
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
    if (activeContract) activeContract.errorSteps.clear();
    document.querySelectorAll('#contractFormBody .has-error').forEach(group => {
        group.classList.remove('has-error');
        group.querySelectorAll('.contract-error').forEach(node => node.remove());
    });
}

function contractToast(message, isError = false) {
    const toast = isError ? window.showErrorToast : window.showSuccessToast;
    if (typeof toast === 'function') toast(message);
}

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================
window.loadContractsFlyout = loadContractsFlyout;
window.openContractForm = openContractForm;
window.closeContractModal = closeContractModal;
window.contractBack = contractBack;