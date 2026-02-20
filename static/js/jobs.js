// API base URL
const API_BASE = '/api';

// State
let allJobs = [];
let filteredJobs = [];
let editingJobId = null;

// DOM Elements
const jobsList = document.getElementById('jobsList');
const assignedFilter = document.getElementById('assignedFilter');
const doneFilter = document.getElementById('doneFilter');
const countryFilter = document.getElementById('countryFilter');
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
    // Get unique assigned people
    const assignedPeople = [...new Set(allJobs.map(job => job.assigned).filter(Boolean))].sort();
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
    
    // Get unique countries
    const countries = [...new Set(allJobs.map(job => job.country).filter(Boolean))].sort();
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
    
    renderJobs();
}

// Render jobs list
function renderJobs() {
    if (!jobsList) return;
    
    if (filteredJobs.length === 0) {
        jobsList.innerHTML = '<p class="no-jobs">No jobs found. Click "+ Add Job" to create one.</p>';
        return;
    }
    
    // Group jobs by done status
    const pendingJobs = filteredJobs.filter(job => !job.done);
    const doneJobs = filteredJobs.filter(job => job.done);
    
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
        <div class="job-card ${job.done ? 'job-card--done' : ''}" data-job-id="${job.id}">
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
        document.getElementById('jobAssigned').value = job.assigned || '';
        document.getElementById('jobDateDue').value = job.date_due || '';
        document.getElementById('jobCountry').value = job.country || '';
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
