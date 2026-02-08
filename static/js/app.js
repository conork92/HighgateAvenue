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
    initPhotoCarousel();
    initProducts();
});

// Products: load and show only products for the current page (no dropdowns)
function initProducts() {
    const section = document.getElementById('productsSection');
    const grid = document.getElementById('productsGrid');
    const loadingEl = document.getElementById('productsLoading');
    if (!section || !grid) return;

    const productRoom = (section.getAttribute('data-product-room') || '').trim();
    loadProducts(productRoom, grid, loadingEl);
    initProductModal(section, grid, loadingEl);
}

function initProductModal(section, grid, loadingEl) {
    const addBtn = document.getElementById('addProductBtn');
    const modal = document.getElementById('productModal');
    const closeBtn = modal && modal.querySelector('.close-product-modal');
    const cancelBtn = document.getElementById('cancelProduct');
    const form = document.getElementById('productForm');
    const productStatus = document.getElementById('productStatus');
    const fetchPreviewBtn = document.getElementById('fetchPreviewBtn');
    const productLinkInput = document.getElementById('productLink');

    if (!addBtn || !modal || !form) return;

    addBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    });

    function closeProductModal() {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        form.reset();
        if (productStatus) productStatus.style.display = 'none';
    }

    if (closeBtn) closeBtn.addEventListener('click', closeProductModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeProductModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeProductModal();
    });

    if (fetchPreviewBtn && productLinkInput) {
        fetchPreviewBtn.addEventListener('click', async () => {
            const url = (productLinkInput.value || '').trim();
            if (!url) return;
            fetchPreviewBtn.disabled = true;
            fetchPreviewBtn.textContent = 'Fetching...';
            try {
                const r = await fetch(`${API_BASE}/products/preview?url=${encodeURIComponent(url)}`);
                const data = await r.json();
                if (r.ok && data) {
                    if (data.title) document.getElementById('productTitle').value = data.title;
                    if (data.image_url) document.getElementById('productImageUrl').value = data.image_url;
                }
            } catch (e) { console.error(e); }
            fetchPreviewBtn.disabled = false;
            fetchPreviewBtn.textContent = 'Fetch image & title from URL';
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const link = (document.getElementById('productLink').value || '').trim();
        if (!link) return;
        const tagsInput = (document.getElementById('productTags').value || '').trim();
        const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];
        const payload = {
            link,
            title: (document.getElementById('productTitle').value || '').trim() || null,
            image_url: (document.getElementById('productImageUrl').value || '').trim() || null,
            price: (document.getElementById('productPrice').value || '').trim() || null,
            category: (document.getElementById('productCategory').value || '').trim() || null,
            room: (document.getElementById('productRoom').value || '').trim() || null,
            website_name: (document.getElementById('productWebsiteName').value || '').trim() || null,
            tags
        };
        const submitBtn = document.getElementById('submitProduct');
        submitBtn.disabled = true;
        if (productStatus) { productStatus.style.display = 'block'; productStatus.textContent = 'Adding...'; productStatus.className = 'upload-status loading'; }
        try {
            const r = await fetch(`${API_BASE}/products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to add product');
            if (productStatus) { productStatus.textContent = 'Product added.'; productStatus.className = 'upload-status success'; }
            const roomFilter = (section.getAttribute('data-product-room') || '').trim();
            loadProducts(roomFilter, grid, loadingEl);
            setTimeout(closeProductModal, 1200);
        } catch (err) {
            if (productStatus) { productStatus.textContent = err.message || 'Error'; productStatus.className = 'upload-status error'; productStatus.style.display = 'block'; }
        } finally {
            submitBtn.disabled = false;
        }
    });
}

function getProductWebsiteDisplay(p) {
    const name = (p.website_name && p.website_name.trim()) ? p.website_name.trim() : null;
    if (name) return name;
    const url = (p.link && p.link.trim()) ? p.link.trim() : '';
    if (!url) return '';
    try {
        const host = new URL(url).hostname || '';
        const withoutWww = host.replace(/^www\./i, '');
        const base = withoutWww.split('.')[0] || withoutWww;
        return base ? base.charAt(0).toUpperCase() + base.slice(1).toLowerCase() : '';
    } catch (e) { return ''; }
}

async function loadProducts(roomFilter, grid, loadingEl) {
    if (loadingEl) loadingEl.style.display = 'block';
    try {
        const url = roomFilter
            ? `${API_BASE}/products?room=${encodeURIComponent(roomFilter)}`
            : `${API_BASE}/products`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const products = await response.json();
        const list = Array.isArray(products) ? products : [];
        grid.innerHTML = list.length === 0
            ? ''
            : list.map(p => {
                const hasImage = p.image_url && p.image_url.trim();
                const imgHtml = hasImage
                    ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.title || 'Product')}" class="product-tile-image" loading="lazy" onerror="this.parentElement.classList.add('product-tile-image--failed')">`
                    : '';
                const title = escapeHtml(p.title || 'Product');
                const rawPrice = (p.price && p.price.trim()) ? p.price.trim() : '';
                const displayPrice = rawPrice && !rawPrice.startsWith('£') ? `£ ${escapeHtml(rawPrice)}` : escapeHtml(rawPrice);
                const price = rawPrice ? `<span class="product-tile-price">${displayPrice}</span>` : '';
                const websiteDisplay = getProductWebsiteDisplay(p);
                const websiteHtml = websiteDisplay ? `<span class="product-tile-website">${escapeHtml(websiteDisplay)}</span>` : '';
                const link = (p.link && p.link.trim()) ? escapeHtml(p.link) : '#';
                return `<div class="product-tile"><a href="${link}" target="_blank" rel="noopener noreferrer" class="product-tile-link"><div class="product-tile-image-wrap">${imgHtml}</div><div class="product-tile-info">${websiteHtml}<span class="product-tile-title">${title}</span>${price}</div></a></div>`;
            }).join('');
    } catch (e) {
        console.error('Error loading products:', e);
        grid.innerHTML = '';
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

// Photo gallery carousel (only on photo-gallery page)
function initPhotoCarousel() {
    const carousel = document.getElementById('photoCarousel');
    if (!carousel) return;

    const track = carousel.querySelector('.carousel-track');
    const slides = track ? track.querySelectorAll('.carousel-slide') : [];
    const prevBtn = carousel.querySelector('.carousel-prev');
    const nextBtn = carousel.querySelector('.carousel-next');
    const dotsContainer = document.getElementById('carouselDots');

    if (slides.length === 0) return;

    let index = 0;

    function showSlide(i) {
        index = ((i % slides.length) + slides.length) % slides.length;
        slides.forEach((s, j) => s.classList.toggle('active', j === index));
        dotsContainer.querySelectorAll('button').forEach((d, j) => d.classList.toggle('active', j === index));
    }

    prevBtn.addEventListener('click', () => showSlide(index - 1));
    nextBtn.addEventListener('click', () => showSlide(index + 1));

    slides.forEach((_, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-label', `Go to slide ${i + 1}`);
        btn.addEventListener('click', () => showSlide(i));
        dotsContainer.appendChild(btn);
    });

    showSlide(0);
}

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
        allPlans = [];
        filteredPlans = [];
        renderPlans();
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
        plansGrid.innerHTML = '';
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
