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
    loadDesignIdeas();
    roomFilter.addEventListener('change', filterPlans);
    initUploadHandlers();
    initPhotoCarousel();
    initProducts();
});

// Design Ideas state
let allDesignIdeas = [];
let designIdeasByRoom = {};

// Load design ideas and group by room
async function loadDesignIdeas() {
    try {
        const response = await fetch(`${API_BASE}/design-ideas?limit=1000`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Handle both old format (array) and new format (object with data)
        if (Array.isArray(result)) {
            allDesignIdeas = result;
        } else {
            allDesignIdeas = result.data || [];
        }
        
        // Group by room
        designIdeasByRoom = {};
        allDesignIdeas.forEach(idea => {
            const room = idea.room || 'Uncategorized';
            if (!designIdeasByRoom[room]) {
                designIdeasByRoom[room] = [];
            }
            designIdeasByRoom[room].push(idea);
        });
        
        renderDesignIdeasByRoom();
    } catch (error) {
        console.error('Error loading design ideas:', error);
        // Don't show error, just don't display design ideas section
        const section = document.getElementById('designIdeasSection');
        if (section) {
            section.style.display = 'none';
        }
    }
}

// Render design ideas grouped by room
function renderDesignIdeasByRoom() {
    const section = document.getElementById('designIdeasSection');
    const container = document.getElementById('designIdeasByRoom');
    
    if (!section || !container) return;
    
    // Get the room filter from the section's data attribute (set by current page/tab)
    const sectionRoom = section.getAttribute('data-section-room') || '';
    const hideSection = section.getAttribute('data-hide-section') === 'true';
    
    // If section should be hidden (like floor-plans with no room filter), hide it
    if (hideSection) {
        section.style.display = 'none';
        return;
    }
    
    // Also check the room filter dropdown
    const selectedRoom = roomFilter ? roomFilter.value : '';
    
    // Use section room if available, otherwise use dropdown filter, otherwise show all
    const roomToFilter = sectionRoom || selectedRoom;
    
    if (allDesignIdeas.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    // If we have a specific room filter, only show that room
    let roomsToShow;
    if (roomToFilter) {
        // Show only the room for this section/page
        roomsToShow = [roomToFilter];
        // Hide section if no ideas for this room
        if (!designIdeasByRoom[roomToFilter] || designIdeasByRoom[roomToFilter].length === 0) {
            section.style.display = 'none';
            return;
        }
    } else {
        // Show all rooms (for "All" page or when no filter)
        // But only if we're not on a specific section page
        if (section.hasAttribute('data-section-room')) {
            // If section has data attribute but it's empty, hide it
            section.style.display = 'none';
            return;
        }
        roomsToShow = Object.keys(designIdeasByRoom).sort();
    }
    
    section.style.display = 'block';
    
    if (roomsToShow.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = roomsToShow.map(room => {
        const ideas = designIdeasByRoom[room] || [];
        if (ideas.length === 0) return '';
        
        return `
            <div class="room-section">
                <h3 class="room-section-title">${escapeHtml(room)}</h3>
                <div class="room-ideas-grid">
                    ${ideas.map(idea => {
                        // Prioritize public_url, fall back to image_path
                        let imageUrl = '';
                        if (idea.public_url) {
                            imageUrl = idea.public_url;
                        } else if (idea.image_path) {
                            imageUrl = idea.image_path.startsWith('http') ? idea.image_path : `/api/image/${idea.image_path}`;
                        }
                        const name = idea.name || 'Untitled';
                        
                        const tags = Array.isArray(idea.tags) ? idea.tags : (idea.tags ? idea.tags.split(',') : []);
                        const liked = idea.liked || false;
                        const bokLikes = idea.bok_likes || 0;
                        const ideaId = idea.id;
                        const tagsDisplay = tags.map(t => t.trim()).filter(t => t).join(', ');
                        
                        return `
                            <div class="room-idea-card" data-id="${escapeHtml(String(ideaId))}">
                                ${imageUrl ? `
                                    <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" class="room-idea-image" loading="lazy" onerror="this.style.display='none'" onclick="showFullImage('${escapeHtml(imageUrl)}', '${escapeHtml(name)}')" style="cursor: pointer;">
                                ` : ''}
                                <div class="room-idea-info">
                                    <p class="room-idea-name">${escapeHtml(name)}</p>
                                    ${idea.category ? `<span class="room-idea-category">${escapeHtml(idea.category)}</span>` : ''}
                                    <div class="room-idea-tags-section">
                                        <div class="room-idea-tags-display" id="tags-display-${escapeHtml(String(ideaId))}">
                                            ${tags.length > 0 ? `
                                                <div class="room-idea-tags">
                                                    ${tags.map(tag => `<span class="room-tag">${escapeHtml(tag.trim())}</span>`).join('')}
                                                </div>
                                            ` : '<span class="room-tags-placeholder">No tags</span>'}
                                        </div>
                                        <div class="room-idea-tags-edit" id="tags-edit-${escapeHtml(String(ideaId))}" style="display: none;">
                                            <input type="text" class="room-tags-input" value="${escapeHtml(tagsDisplay)}" placeholder="tag1, tag2, tag3" data-id="${escapeHtml(String(ideaId))}">
                                            <button class="room-tags-save" onclick="saveRoomIdeaTags('${escapeHtml(String(ideaId))}')">Save</button>
                                            <button class="room-tags-cancel" onclick="cancelRoomIdeaTags('${escapeHtml(String(ideaId))}')">Cancel</button>
                                        </div>
                                        <button class="room-tags-edit-btn" onclick="editRoomIdeaTags('${escapeHtml(String(ideaId))}')" title="Edit tags">✏️</button>
                                    </div>
                                    <div class="room-idea-actions">
                                        <button class="room-like-btn ${liked ? 'liked' : ''}" data-id="${escapeHtml(String(ideaId))}" data-liked="${liked}" onclick="toggleRoomIdeaLike('${escapeHtml(String(ideaId))}')">
                                            <span>${liked ? '❤️' : '🤍'}</span>
                                        </button>
                                        <button class="room-bok-likes-btn" data-id="${escapeHtml(String(ideaId))}" onclick="incrementRoomIdeaBokLikes('${escapeHtml(String(ideaId))}')">
                                            <span>👍</span> <span class="room-bok-count">${bokLikes}</span>
                                        </button>
                                        <button type="button" class="room-remove-idea-btn" data-id="${escapeHtml(String(ideaId))}" title="Remove from view" onclick="removeRoomIdea('${escapeHtml(String(ideaId))}')">
                                            <span>✕</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
}


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
        const isMwhEl = document.getElementById('productIsMwh');
        const isMwh = isMwhEl ? isMwhEl.checked : false;
        const payload = {
            link,
            title: (document.getElementById('productTitle').value || '').trim() || null,
            image_url: (document.getElementById('productImageUrl').value || '').trim() || null,
            price: (document.getElementById('productPrice').value || '').trim() || null,
            category: (document.getElementById('productCategory').value || '').trim() || null,
            room: (document.getElementById('productRoom').value || '').trim() || null,
            website_name: (document.getElementById('productWebsiteName').value || '').trim() || null,
            tags,
            is_mwh: isMwh
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
    renderDesignIdeasByRoom();
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

// Show full-size image in modal
function showFullImage(imageUrl, imageName) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = `
        <div class="image-modal-content">
            <span class="image-modal-close">&times;</span>
            <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(imageName)}" class="image-modal-img">
            <p class="image-modal-caption">${escapeHtml(imageName)}</p>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Close on X click
    modal.querySelector('.image-modal-close').addEventListener('click', () => {
        closeImageModal(modal);
    });
    
    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeImageModal(modal);
        }
    });
    
    // Close on Escape key
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            closeImageModal(modal);
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
}

function closeImageModal(modal) {
    modal.style.opacity = '0';
    setTimeout(() => {
        if (document.body.contains(modal)) {
            document.body.removeChild(modal);
        }
        document.body.style.overflow = '';
    }, 200);
}

// Make showFullImage available globally
window.showFullImage = showFullImage;

// Toggle like for room idea
async function toggleRoomIdeaLike(ideaId) {
    const btn = document.querySelector(`.room-like-btn[data-id="${ideaId}"]`);
    if (!btn) return;
    
    const currentLiked = btn.dataset.liked === 'true';
    const newLiked = !currentLiked;
    
    // Optimistic update
    btn.dataset.liked = newLiked;
    btn.querySelector('span').textContent = newLiked ? '❤️' : '🤍';
    btn.classList.toggle('liked', newLiked);
    btn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/design-ideas/${ideaId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ liked: newLiked })
        });
        
        let responseData;
        try {
            responseData = await response.json();
        } catch (e) {
            throw new Error(`Invalid response from server: ${response.status} ${response.statusText}`);
        }
        
        if (!response.ok) {
            throw new Error(responseData.error || 'Failed to update like status');
        }
        
        // Update local state
        const idea = allDesignIdeas.find(i => String(i.id) === String(ideaId));
        if (idea) {
            idea.liked = newLiked;
        }
        
    } catch (error) {
        console.error('Error toggling like:', error);
        // Revert on error
        btn.dataset.liked = currentLiked;
        btn.querySelector('span').textContent = currentLiked ? '❤️' : '🤍';
        btn.classList.toggle('liked', currentLiked);
        alert(`Error updating like status: ${error.message}`);
    } finally {
        btn.disabled = false;
    }
}

// Increment bok likes for room idea
async function incrementRoomIdeaBokLikes(ideaId) {
    const btn = document.querySelector(`.room-bok-likes-btn[data-id="${ideaId}"]`);
    const countEl = btn?.querySelector('.room-bok-count');
    if (!btn || !countEl) return;
    
    const currentCount = parseInt(countEl.textContent) || 0;
    const newCount = currentCount + 1;
    
    // Optimistic update
    countEl.textContent = newCount;
    btn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/design-ideas/${ideaId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ bok_likes: newCount })
        });
        
        let responseData;
        try {
            responseData = await response.json();
        } catch (e) {
            throw new Error(`Invalid response from server: ${response.status} ${response.statusText}`);
        }
        
        if (!response.ok) {
            throw new Error(responseData.error || 'Failed to update bok likes');
        }
        
        // Update local state
        const idea = allDesignIdeas.find(i => String(i.id) === String(ideaId));
        if (idea) {
            idea.bok_likes = newCount;
        }
        
    } catch (error) {
        console.error('Error incrementing bok likes:', error);
        // Revert on error
        countEl.textContent = currentCount;
        alert(`Error updating bok likes: ${error.message}`);
    } finally {
        btn.disabled = false;
    }
}

// Remove room idea from view (mark as removed)
async function removeRoomIdea(ideaId) {
    const card = document.querySelector(`.room-idea-card[data-id="${ideaId}"]`);
    const btn = card?.querySelector('.room-remove-idea-btn');
    if (!card || !btn) return;
    
    btn.disabled = true;
    try {
        const response = await fetch(`${API_BASE}/design-ideas/${ideaId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ removed: true })
        });
        const responseData = await response.json();
        if (!response.ok) {
            throw new Error(responseData.error || 'Failed to remove idea');
        }
        allDesignIdeas = allDesignIdeas.filter(i => String(i.id) !== String(ideaId));
        card.remove();
    } catch (error) {
        console.error('Error removing idea:', error);
        alert(`Error: ${error.message}`);
    } finally {
        btn.disabled = false;
    }
}
window.removeRoomIdea = removeRoomIdea;

// Edit tags for room idea
function editRoomIdeaTags(ideaId) {
    const displayEl = document.getElementById(`tags-display-${ideaId}`);
    const editEl = document.getElementById(`tags-edit-${ideaId}`);
    if (!displayEl || !editEl) return;
    
    displayEl.style.display = 'none';
    editEl.style.display = 'flex';
    editEl.querySelector('.room-tags-input').focus();
}

function cancelRoomIdeaTags(ideaId) {
    const displayEl = document.getElementById(`tags-display-${ideaId}`);
    const editEl = document.getElementById(`tags-edit-${ideaId}`);
    if (!displayEl || !editEl) return;
    
    // Reset input value
    const idea = allDesignIdeas.find(i => String(i.id) === String(ideaId));
    if (idea) {
        const tags = Array.isArray(idea.tags) ? idea.tags : (idea.tags ? idea.tags.split(',') : []);
        const tagsDisplay = tags.map(t => t.trim()).filter(t => t).join(', ');
        editEl.querySelector('.room-tags-input').value = tagsDisplay;
    }
    
    displayEl.style.display = 'block';
    editEl.style.display = 'none';
}

async function saveRoomIdeaTags(ideaId) {
    const editEl = document.getElementById(`tags-edit-${ideaId}`);
    const displayEl = document.getElementById(`tags-display-${ideaId}`);
    if (!editEl || !displayEl) return;
    
    const input = editEl.querySelector('.room-tags-input');
    const tagsValue = input.value.trim();
    const tags = tagsValue ? tagsValue.split(',').map(t => t.trim()).filter(t => t) : [];
    
    const saveBtn = editEl.querySelector('.room-tags-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    
    try {
        const response = await fetch(`${API_BASE}/design-ideas/${ideaId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ tags: tags })
        });
        
        let responseData;
        try {
            responseData = await response.json();
        } catch (e) {
            throw new Error(`Invalid response from server: ${response.status} ${response.statusText}`);
        }
        
        if (!response.ok) {
            throw new Error(responseData.error || 'Failed to save tags');
        }
        
        // Update local state
        const idea = allDesignIdeas.find(i => String(i.id) === String(ideaId));
        if (idea) {
            idea.tags = tags;
        }
        
        // Update display
        if (tags.length > 0) {
            displayEl.innerHTML = `
                <div class="room-idea-tags">
                    ${tags.map(tag => `<span class="room-tag">${escapeHtml(tag)}</span>`).join('')}
                </div>
            `;
        } else {
            displayEl.innerHTML = '<span class="room-tags-placeholder">No tags</span>';
        }
        
        displayEl.style.display = 'block';
        editEl.style.display = 'none';
        saveBtn.textContent = 'Saved!';
        setTimeout(() => {
            saveBtn.textContent = 'Save';
            saveBtn.disabled = false;
        }, 1000);
        
    } catch (error) {
        console.error('Error saving tags:', error);
        alert(`Error saving tags: ${error.message}`);
        saveBtn.textContent = 'Save';
        saveBtn.disabled = false;
    }
}

// Make functions available globally
window.toggleRoomIdeaLike = toggleRoomIdeaLike;
window.incrementRoomIdeaBokLikes = incrementRoomIdeaBokLikes;
window.editRoomIdeaTags = editRoomIdeaTags;
window.cancelRoomIdeaTags = cancelRoomIdeaTags;
window.saveRoomIdeaTags = saveRoomIdeaTags;

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
