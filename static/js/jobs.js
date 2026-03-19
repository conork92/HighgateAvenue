// API base URL
const API_BASE = '/api';

// Canonical dropdown options (edit here to add new ones)
const ASSIGNED_OPTIONS = ['Conor', 'Rebecca', 'Caroline'];
const COUNTRY_OPTIONS = ['Hong Kong', 'London', 'Other'];

// State
let allJobs = [];
let filteredJobs = [];
let editingJobId = null;

// DOM Elements
const jobsList = document.getElementById('jobsList');
const assignedFilter = document.getElementById('assignedFilter');
const doneFilter = document.getElementById('doneFilter');
const countryFilter = document.getElementById('countryFilter');
const jobsTodayTile = document.getElementById('jobsTodayTile');
const loading = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const addJobBtn = document.getElementById('addJobBtn');

// Modal elements
const jobModal = document.getElementById('jobModal');
const jobForm = document.getElementById('jobForm');
const jobModalTitle = document.getElementById('jobModalTitle');
const closeJobModal = document.querySelector('.close-job-modal');
const cancelJobBtn = document.getElementById('cancelJob');
const jobStatus = document.getElementById('jobStatus');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadJobs();
    initFilters();
    initModalHandlers();
    
    if (assignedFilter) assignedFilter.addEventListener('change', filterJobs);
    if (doneFilter) doneFilter.addEventListener('change', filterJobs);
    if (countryFilter) countryFilter.addEventListener('change', filterJobs);
    if (addJobBtn) addJobBtn.addEventListener('click', () => openJobModal());
});

// Load jobs from API
async function loadJobs() {
    try {
        showLoading(true);
        hideError();
        
        const response = await fetch(`${API_BASE}/jobs`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        allJobs = await response.json();
        filteredJobs = [...allJobs];
        
        updateFilters();
        renderTodayTile();
        renderJobs();
        showLoading(false);
    } catch (error) {
        console.error('Error loading jobs:', error);
        showError('Failed to load jobs. Please try again.');
        showLoading(false);
    }
}

// Initialize filter dropdowns with unique values
function initFilters() {
    // This will be populated after jobs are loaded
}

// Update filter dropdowns with unique values from jobs
function updateFilters() {
    // Keep canonical options, but also include any legacy values already in DB (so nothing breaks).
    const assignedLegacy = [...new Set(allJobs.map(job => job.assigned).filter(Boolean))].filter(v => !ASSIGNED_OPTIONS.includes(v)).sort();
    const assignedPeople = [...ASSIGNED_OPTIONS, ...assignedLegacy];
    if (assignedFilter) {
        const currentValue = assignedFilter.value;
        assignedFilter.innerHTML = '<option value="">All People</option>';
        assignedPeople.forEach(person => {
            const option = document.createElement('option');
            option.value = person;
            option.textContent = person;
            assignedFilter.appendChild(option);
        });
        assignedFilter.value = currentValue;
    }
    
    const countryLegacy = [...new Set(allJobs.map(job => job.country).filter(Boolean))].filter(v => !COUNTRY_OPTIONS.includes(v)).sort();
    const countries = [...COUNTRY_OPTIONS, ...countryLegacy];
    if (countryFilter) {
        const currentValue = countryFilter.value;
        countryFilter.innerHTML = '<option value="">All Countries</option>';
        countries.forEach(country => {
            const option = document.createElement('option');
            option.value = country;
            option.textContent = country;
            countryFilter.appendChild(option);
        });
        countryFilter.value = currentValue;
    }
}

function renderTodayTile() {
    if (!jobsTodayTile) return;
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    const pending = allJobs.filter(j => !j.done);
    const dueToday = pending.filter(j => j.date_due === todayStr);
    const overdue = pending.filter(j => j.date_due && j.date_due < todayStr);

    const total = dueToday.length + overdue.length;
    if (total === 0) {
        jobsTodayTile.style.display = 'none';
        jobsTodayTile.innerHTML = '';
        jobsTodayTile.classList.remove('jobs-today-tile--urgent');
        return;
    }

    const urgent = overdue.length > 0;
    jobsTodayTile.classList.toggle('jobs-today-tile--urgent', urgent);
    jobsTodayTile.style.display = 'block';

    const title = urgent ? 'Jobs due today / overdue' : 'Jobs due today';
    const meta = urgent
        ? `${dueToday.length} due today, ${overdue.length} overdue`
        : `${dueToday.length} due today`;

    const items = [
        ...overdue.sort((a, b) => (a.date_due || '').localeCompare(b.date_due || '')),
        ...dueToday.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
    ].slice(0, 8);

    const listHtml = items.map(j => {
        const badge = j.date_due && j.date_due < todayStr ? '<span class="jobs-today-tile__badge">Overdue</span>' : '<span class="jobs-today-tile__badge">Today</span>';
        return `<a class="jobs-today-tile__link" href="#job-${j.id}" data-job-jump="${j.id}">${escapeHtml(j.name)}${badge}</a>`;
    }).join('');

    jobsTodayTile.innerHTML = `
        <div class="jobs-today-tile__title">${escapeHtml(title)}</div>
        <div class="jobs-today-tile__meta">${escapeHtml(meta)}</div>
        <div class="jobs-today-tile__list">${listHtml}</div>
    `;

    jobsTodayTile.querySelectorAll('[data-job-jump]').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            const id = e.currentTarget.getAttribute('data-job-jump');
            const el = document.getElementById(`job-${id}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                el.classList.add('job-card--flash');
                setTimeout(() => el.classList.remove('job-card--flash'), 1200);
            }
        });
    });
}

// Filter jobs based on selected filters
function filterJobs() {
    const assigned = assignedFilter?.value || '';
    const done = doneFilter?.value || '';
    const country = countryFilter?.value || '';
    
    filteredJobs = allJobs.filter(job => {
        if (assigned && job.assigned !== assigned) return false;
        if (done !== '' && String(job.done) !== done) return false;
        if (country && job.country !== country) return false;
        return true;
    });
    
    renderTodayTile();
    renderJobs();
}

// Render jobs list
function renderJobs() {
    if (!jobsList) return;
    
    if (filteredJobs.length === 0) {
        jobsList.innerHTML = '<p class="no-jobs">No jobs found. Click "+ Add Job" to create one.</p>';
        return;
    }
    
    // Sort by due date (earliest first; blank due dates last)
    const byDueAscNullLast = (a, b) => {
        const ad = a.date_due || '';
        const bd = b.date_due || '';
        if (ad && bd) return ad.localeCompare(bd);
        if (!ad && bd) return 1;
        if (ad && !bd) return -1;
        return String(b.created_at || '').localeCompare(String(a.created_at || '')); // newest first tie-break
    };
    
    // Group jobs by done status
    const pendingJobs = filteredJobs.filter(job => !job.done).sort(byDueAscNullLast);
    const doneJobs = filteredJobs.filter(job => job.done).sort(byDueAscNullLast);
    
    let html = '';
    
    // Render pending jobs
    if (pendingJobs.length > 0) {
        html += '<div class="jobs-section">';
        html += '<h2 class="jobs-section-title">Pending</h2>';
        html += '<div class="jobs-grid">';
        pendingJobs.forEach(job => {
            html += renderJobCard(job);
        });
        html += '</div></div>';
    }
    
    // Render done jobs
    if (doneJobs.length > 0) {
        html += '<div class="jobs-section">';
        html += '<h2 class="jobs-section-title">Completed</h2>';
        html += '<div class="jobs-grid">';
        doneJobs.forEach(job => {
            html += renderJobCard(job);
        });
        html += '</div></div>';
    }
    
    jobsList.innerHTML = html;
    
    // Attach event listeners to job cards
    attachJobCardListeners();
}

// Render a single job card
function renderJobCard(job) {
    const dueDate = job.date_due ? new Date(job.date_due).toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
    }) : 'No due date';
    
    const isOverdue = job.date_due && !job.done && new Date(job.date_due) < new Date();
    const dueDateClass = isOverdue ? 'job-due-date overdue' : 'job-due-date';
    
    const tagsHtml = job.tags && job.tags.length > 0
        ? `<div class="job-tags">${job.tags.map(tag => `<span class="job-tag">${tag}</span>`).join('')}</div>`
        : '';
    
    return `
        <div class="job-card ${job.done ? 'job-card--done' : ''}" data-job-id="${job.id}" id="job-${job.id}">
            <div class="job-header">
                <h3 class="job-name">${escapeHtml(job.name)}</h3>
                <label class="job-checkbox-label">
                    <input type="checkbox" class="job-done-checkbox" ${job.done ? 'checked' : ''} data-job-id="${job.id}">
                    <span class="job-checkbox-custom"></span>
                </label>
            </div>
            <div class="job-details">
                ${job.assigned ? `<div class="job-detail"><span class="job-detail-label">Assigned:</span> <span class="job-detail-value">${escapeHtml(job.assigned)}</span></div>` : ''}
                <div class="job-detail">
                    <span class="job-detail-label">Due:</span> 
                    <span class="${dueDateClass}">${dueDate}</span>
                </div>
                ${job.country ? `<div class="job-detail"><span class="job-detail-label">Country:</span> <span class="job-detail-value">${escapeHtml(job.country)}</span></div>` : ''}
            </div>
            ${job.notes ? `<div class="job-notes"><span class="job-detail-label">Notes:</span> <span class="job-notes-text">${escapeHtml(job.notes)}</span></div>` : ''}
            ${tagsHtml}
            <div class="job-actions">
                <button class="job-edit-btn" data-job-id="${job.id}">Edit</button>
                <button class="job-delete-btn" data-job-id="${job.id}">Delete</button>
            </div>
        </div>
    `;
}

// Attach event listeners to job cards
function attachJobCardListeners() {
    // Done checkbox
    document.querySelectorAll('.job-done-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            const jobId = e.target.dataset.jobId;
            const done = e.target.checked;
            await updateJob(jobId, { done });
        });
    });
    
    // Edit button
    document.querySelectorAll('.job-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const jobId = e.target.dataset.jobId;
            const job = allJobs.find(j => j.id == jobId);
            if (job) {
                openJobModal(job);
            }
        });
    });
    
    // Delete button
    document.querySelectorAll('.job-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const jobId = e.target.dataset.jobId;
            if (confirm('Are you sure you want to delete this job?')) {
                await deleteJob(jobId);
            }
        });
    });
}

// Initialize modal handlers
function initModalHandlers() {
    if (!jobModal) return;
    
    // Open modal
    if (addJobBtn) {
        addJobBtn.addEventListener('click', () => openJobModal());
    }
    
    // Close modal
    if (closeJobModal) {
        closeJobModal.addEventListener('click', closeJobModalFunc);
    }
    if (cancelJobBtn) {
        cancelJobBtn.addEventListener('click', closeJobModalFunc);
    }
    
    // Close on outside click
    jobModal.addEventListener('click', (e) => {
        if (e.target === jobModal) {
            closeJobModalFunc();
        }
    });
    
    // Form submit
    if (jobForm) {
        jobForm.addEventListener('submit', handleJobSubmit);
    }
}

// Open job modal (for add or edit)
function openJobModal(job = null) {
    editingJobId = job ? job.id : null;
    
    if (jobModalTitle) {
        jobModalTitle.textContent = job ? 'Edit Job' : 'Add New Job';
    }
    
    // Reset form
    if (jobForm) {
        jobForm.reset();
    }
    
    // Populate form if editing
    if (job) {
        document.getElementById('jobName').value = job.name || '';
        ensureSelectHasValue(document.getElementById('jobAssigned'), job.assigned);
        document.getElementById('jobDateDue').value = job.date_due || '';
        ensureSelectHasValue(document.getElementById('jobCountry'), job.country);
        document.getElementById('jobTags').value = job.tags ? job.tags.join(', ') : '';
        document.getElementById('jobNotes').value = job.notes || '';
        document.getElementById('jobDone').checked = job.done || false;
    }
    
    jobModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    hideJobStatus();
}

// Close job modal
function closeJobModalFunc() {
    jobModal.style.display = 'none';
    document.body.style.overflow = '';
    editingJobId = null;
    if (jobForm) {
        jobForm.reset();
    }
    hideJobStatus();
}

// Handle job form submit
async function handleJobSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const tags = formData.get('tags') ? formData.get('tags').split(',').map(t => t.trim()).filter(Boolean) : [];
    
    const jobData = {
        name: formData.get('name'),
        assigned: formData.get('assigned') || null,
        date_due: formData.get('date_due') || null,
        country: formData.get('country') || null,
        tags: tags,
        notes: formData.get('notes') || null,
        done: formData.get('done') === 'on'
    };
    
    try {
        showJobStatus('Saving...', 'loading');
        
        if (editingJobId) {
            await updateJob(editingJobId, jobData);
        } else {
            await createJob(jobData);
        }
        
        showJobStatus('Job saved successfully!', 'success');
        setTimeout(() => {
            closeJobModalFunc();
            loadJobs();
        }, 1000);
    } catch (error) {
        console.error('Error saving job:', error);
        showJobStatus('Failed to save job. Please try again.', 'error');
    }
}

function ensureSelectHasValue(selectEl, value) {
    if (!selectEl) return;
    const v = (value || '').trim();
    if (!v) {
        selectEl.value = '';
        return;
    }
    const has = [...selectEl.options].some(o => o.value === v);
    if (!has) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        selectEl.appendChild(opt);
    }
    selectEl.value = v;
}

// Create a new job
async function createJob(jobData) {
    const response = await fetch(`${API_BASE}/jobs`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(jobData)
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create job');
    }
    
    return await response.json();
}

// Update a job
async function updateJob(jobId, updates) {
    const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update job');
    }
    
    // Reload jobs to get updated data
    await loadJobs();
    return await response.json();
}

// Delete a job
async function deleteJob(jobId) {
    try {
        const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete job');
        }
        
        await loadJobs();
    } catch (error) {
        console.error('Error deleting job:', error);
        alert('Failed to delete job. Please try again.');
    }
}

// Show/hide loading
function showLoading(show) {
    if (loading) {
        loading.style.display = show ? 'flex' : 'none';
    }
}

// Show/hide error
function showError(message) {
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

function hideError() {
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
}

// Show job status
function showJobStatus(message, type = 'success') {
    if (jobStatus) {
        jobStatus.textContent = message;
        jobStatus.className = `upload-status ${type}`;
        jobStatus.style.display = 'block';
    }
}

function hideJobStatus() {
    if (jobStatus) {
        jobStatus.style.display = 'none';
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
