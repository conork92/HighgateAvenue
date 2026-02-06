// API base URL
const API_BASE = '/api';

// State
let allPlans = [];
let filteredPlans = [];

// DOM Elements
const plansGrid = document.getElementById('plansGrid');
const roomFilter = document.getElementById('roomFilter');
const loading = document.getElementById('loading');
const errorDiv = document.getElementById('error');

// Upload elements
const uploadBtn = document.getElementById('uploadBtn');
const uploadModal = document.getElementById('uploadModal');
const closeModal = document.querySelector('.close-modal');
const uploadForm = document.getElementById('uploadForm');
const imageInput = document.getElementById('imageInput');
const uploadArea = document.getElementById('uploadArea');
const uploadPreview = document.getElementById('uploadPreview');
const previewImage = document.getElementById('previewImage');
const removeImageBtn = document.getElementById('removeImage');
const cancelUploadBtn = document.getElementById('cancelUpload');
const uploadStatus = document.getElementById('uploadStatus');

// Upload state
let selectedFile = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadPlans();
    roomFilter.addEventListener('change', filterPlans);
    initUploadHandlers();
});

// Load plans from API
async function loadPlans() {
    try {
        loading.style.display = 'block';
        errorDiv.style.display = 'none';
        
        const response = await fetch(`${API_BASE}/plans`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        allPlans = Array.isArray(data) ? data : [];
        filteredPlans = allPlans;
        
        renderPlans();
        loading.style.display = 'none';
    } catch (error) {
        console.error('Error loading plans:', error);
        loading.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.textContent = `Error loading plans: ${error.message}`;
    }
}

// Filter plans by room
function filterPlans() {
    const selectedRoom = roomFilter.value;
    
    if (selectedRoom === '') {
        filteredPlans = allPlans;
    } else {
        filteredPlans = allPlans.filter(plan => 
            plan.room && plan.room.toLowerCase() === selectedRoom.toLowerCase()
        );
    }
    
    renderPlans();
}

// Render plans to the grid
function renderPlans() {
        if (filteredPlans.length === 0) {
            plansGrid.innerHTML = `
                <div class="plan-card" style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem;">
                    <p style="color: #666; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.1em;">
                        No plans found. Add some renovation ideas to get started.
                    </p>
                </div>
            `;
            return;
        }
    
    plansGrid.innerHTML = filteredPlans.map(plan => {
        const imageHtml = plan.image_url ? 
            `<img src="${escapeHtml(plan.image_url)}" alt="${escapeHtml(plan.title || 'Plan image')}" class="plan-image" loading="lazy" onerror="this.style.display='none'">` : 
            '';
        
        return `
            <div class="plan-card">
                ${imageHtml}
                <div class="plan-header">
                    <span class="plan-room">${escapeHtml(plan.room || 'General')}</span>
                </div>
                <h2 class="plan-title">${escapeHtml(plan.title || 'Untitled')}</h2>
                ${plan.description ? `<p class="plan-description">${escapeHtml(plan.description)}</p>` : ''}
                ${plan.tags && plan.tags.length > 0 ? `
                    <div class="plan-tags">
                        ${plan.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                ` : ''}
                ${plan.source_url ? `<p style="margin-top: 1rem;"><a href="${escapeHtml(plan.source_url)}" target="_blank" rel="noopener noreferrer">View Source →</a></p>` : ''}
            </div>
        `;
    }).join('');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize upload handlers
function initUploadHandlers() {
    // Open modal
    uploadBtn.addEventListener('click', () => {
        uploadModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    });

    // Close modal
    closeModal.addEventListener('click', closeUploadModal);
    cancelUploadBtn.addEventListener('click', closeUploadModal);
    
    // Close on outside click
    uploadModal.addEventListener('click', (e) => {
        if (e.target === uploadModal) {
            closeUploadModal();
        }
    });

    // File input change
    imageInput.addEventListener('change', handleFileSelect);

    // Upload area click
    uploadArea.addEventListener('click', () => {
        if (!uploadPreview.style.display || uploadPreview.style.display === 'none') {
            imageInput.click();
        }
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });

    // Remove image
    removeImageBtn.addEventListener('click', () => {
        selectedFile = null;
        imageInput.value = '';
        uploadPreview.style.display = 'none';
        document.querySelector('.upload-placeholder').style.display = 'block';
    });

    // Form submission
    uploadForm.addEventListener('submit', handleUpload);
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
}

function handleFile(file) {
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showUploadStatus('Please select an image file', 'error');
        return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
        showUploadStatus('File size must be less than 10MB', 'error');
        return;
    }

    selectedFile = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        uploadPreview.style.display = 'block';
        document.querySelector('.upload-placeholder').style.display = 'none';
    };
    reader.readAsDataURL(file);
}

function closeUploadModal() {
    uploadModal.style.display = 'none';
    document.body.style.overflow = '';
    resetUploadForm();
}

function resetUploadForm() {
    uploadForm.reset();
    selectedFile = null;
    uploadPreview.style.display = 'none';
    document.querySelector('.upload-placeholder').style.display = 'block';
    uploadStatus.style.display = 'none';
    uploadArea.classList.remove('dragover');
}

async function handleUpload(e) {
    e.preventDefault();

    if (!selectedFile) {
        showUploadStatus('Please select an image first', 'error');
        return;
    }

    const submitBtn = document.getElementById('submitUpload');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';

    showUploadStatus('Uploading image...', 'loading');

    try {
        const formData = new FormData();
        formData.append('image', selectedFile);
        formData.append('room', document.getElementById('planRoom').value);
        formData.append('title', document.getElementById('planTitle').value);
        formData.append('description', document.getElementById('planDescription').value);
        formData.append('tags', document.getElementById('planTags').value);
        formData.append('source_url', document.getElementById('planSource').value);

        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Upload failed');
        }

        showUploadStatus('Design uploaded successfully!', 'success');
        
        // Reload plans after a short delay
        setTimeout(() => {
            loadPlans();
            setTimeout(() => {
                closeUploadModal();
            }, 1500);
        }, 1000);

    } catch (error) {
        console.error('Upload error:', error);
        showUploadStatus(`Error: ${error.message}`, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload & Save';
    }
}

function showUploadStatus(message, type) {
    uploadStatus.textContent = message;
    uploadStatus.className = `upload-status ${type}`;
    uploadStatus.style.display = 'block';
}
