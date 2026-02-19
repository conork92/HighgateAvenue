// API base URL
const API_BASE = '/api';

// State
let allIdeas = [];
let filteredIdeas = [];
let unsavedChanges = new Set();
let currentPage = 0;
let pageSize = 20;
let totalIdeas = 0;

// DOM Elements
const ideasGrid = document.getElementById('ideasGrid');
const roomFilter = document.getElementById('roomFilterCategorize');
const categoryFilter = document.getElementById('categoryFilter');
const loading = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const saveAllBtn = document.getElementById('saveAllBtn');

// Room options
const ROOM_OPTIONS = [
    '', 'Living Room', 'Kitchen', 'Bedroom 1', 'Bedroom 2', 'Bedroom 3',
    'Bathroom 1', 'Bathroom 2', 'Hallway', 'Stairways', 'Other'
];

// Category options
const CATEGORY_OPTIONS = [
    '', 'Furniture', 'Lighting', 'Decor', 'Kitchen', 'Bathroom', 'Storage', 'Other'
];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadDesignIdeas();
    roomFilter.addEventListener('change', filterIdeas);
    categoryFilter.addEventListener('input', filterIdeas);
    saveAllBtn.addEventListener('click', saveAllChanges);
});

// Load design ideas from API
async function loadDesignIdeas(resetPage = true) {
    try {
        loading.style.display = 'flex';
        errorDiv.style.display = 'none';
        
        if (resetPage) {
            currentPage = 0;
        }
        
        const selectedRoom = roomFilter.value;
        const selectedCategory = categoryFilter.value;
        
        const params = new URLSearchParams({
            limit: pageSize.toString(),
            offset: (currentPage * pageSize).toString()
        });
        
        if (selectedRoom) {
            params.append('room', selectedRoom);
        }
        
        const response = await fetch(`${API_BASE}/design-ideas?${params}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Handle both old format (array) and new format (object with data)
        if (Array.isArray(result)) {
            allIdeas = result;
            totalIdeas = result.length;
        } else {
            allIdeas = result.data || [];
            totalIdeas = result.total || 0;
        }
        
        filteredIdeas = allIdeas;
        
        renderIdeas();
        renderPagination();
        loading.style.display = 'none';
    } catch (error) {
        console.error('Error loading design ideas:', error);
        loading.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.textContent = `Error loading design ideas: ${error.message}`;
    }
}

// Filter ideas by room and category
function filterIdeas() {
    // For category filter, we'll filter client-side since it's now free text
    const selectedRoom = roomFilter.value;
    const selectedCategory = categoryFilter.value.toLowerCase().trim();
    
    if (selectedRoom && !selectedCategory) {
        // If only room filter, reload from API
        loadDesignIdeas(true);
    } else {
        // Filter client-side for category (free text search)
        filteredIdeas = allIdeas.filter(idea => {
            const roomMatch = !selectedRoom || (selectedRoom === '' && !idea.room) || idea.room === selectedRoom;
            const categoryMatch = !selectedCategory || 
                (idea.category && idea.category.toLowerCase().includes(selectedCategory)) ||
                (!idea.category && selectedCategory === '');
            return roomMatch && categoryMatch;
        });
        
        renderIdeas();
        renderPagination();
    }
}

// Make goToPage available globally
window.goToPage = goToPage;
window.showFullImage = showFullImage;

// Render ideas to the grid
function renderIdeas() {
    if (filteredIdeas.length === 0) {
        ideasGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem;">
                <p style="color: #666; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.1em;">
                    No design ideas found.
                </p>
            </div>
        `;
        return;
    }
    
    ideasGrid.innerHTML = filteredIdeas.map(idea => {
        // Prioritize public_url, fall back to image_path
        let imageUrl = '';
        if (idea.public_url) {
            imageUrl = idea.public_url;
        } else if (idea.image_path) {
            imageUrl = idea.image_path.startsWith('http') ? idea.image_path : `/api/image/${idea.image_path}`;
        }
        
        const roomValue = idea.room || '';
        const categoryValue = idea.category || '';
        const tags = Array.isArray(idea.tags) ? idea.tags : (idea.tags ? idea.tags.split(',') : []);
        const name = idea.name || '';
        const liked = idea.liked || false;
        const bokLikes = idea.bok_likes || 0;
        
        return `
            <div class="idea-card" data-id="${idea.id}">
                ${imageUrl ? `
                    <div class="idea-image-container">
                        <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" class="idea-image" loading="lazy" decoding="async" onerror="this.style.display='none'" onclick="showFullImage('${escapeHtml(imageUrl)}', '${escapeHtml(name)}')" style="cursor: pointer;">
                    </div>
                ` : ''}
                <div class="idea-info">
                    <input type="text" class="idea-name-input" value="${escapeHtml(name)}" placeholder="Name" data-field="name" data-id="${idea.id}">
                    <div class="idea-fields">
                        <div class="idea-field">
                            <label>Room</label>
                            <select class="idea-room-select" data-field="room" data-id="${idea.id}">
                                ${ROOM_OPTIONS.map(room => `
                                    <option value="${escapeHtml(room)}" ${room === roomValue ? 'selected' : ''}>${room || 'Uncategorized'}</option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="idea-field">
                            <label>Category</label>
                            <input type="text" class="idea-category-input" value="${escapeHtml(categoryValue)}" placeholder="e.g., Furniture, Lighting, Decor" data-field="category" data-id="${idea.id}">
                        </div>
                        <div class="idea-field">
                            <label>Tags (comma-separated)</label>
                            <input type="text" class="idea-tags-input" value="${escapeHtml(tags.join(', '))}" placeholder="tag1, tag2, tag3" data-field="tags" data-id="${idea.id}">
                        </div>
                        <div class="idea-likes">
                            <button class="like-btn ${liked ? 'liked' : ''}" data-id="${idea.id}" data-liked="${liked}">
                                <span>${liked ? '❤️' : '🤍'}</span> Liked
                            </button>
                            <button class="bok-likes-btn" data-id="${idea.id}">
                                <span>👍</span> Bok Likes: <span class="bok-count">${bokLikes}</span>
                            </button>
                        </div>
                    </div>
                    <div class="idea-actions">
                        <button class="idea-save-btn" data-id="${idea.id}">Save</button>
                    </div>
                    <div class="idea-status unsaved" id="status-${idea.id}" style="display: none;">Unsaved changes</div>
                </div>
            </div>
        `;
    }).join('');
    
    // Attach event listeners
    attachEventListeners();
    updateSaveAllButton();
}

// Attach event listeners to form fields
function attachEventListeners() {
    // Name inputs
    document.querySelectorAll('.idea-name-input').forEach(input => {
        input.addEventListener('input', () => markAsChanged(input.dataset.id));
    });
    
    // Room selects
    document.querySelectorAll('.idea-room-select').forEach(select => {
        select.addEventListener('change', () => markAsChanged(select.dataset.id));
    });
    
    // Category inputs
    document.querySelectorAll('.idea-category-input').forEach(input => {
        input.addEventListener('input', () => markAsChanged(input.dataset.id));
    });
    
    // Tags inputs
    document.querySelectorAll('.idea-tags-input').forEach(input => {
        input.addEventListener('input', () => markAsChanged(input.dataset.id));
    });
    
    // Save buttons
    document.querySelectorAll('.idea-save-btn').forEach(btn => {
        btn.addEventListener('click', () => saveIdea(btn.dataset.id));
    });
    
    // Like buttons
    document.querySelectorAll('.like-btn').forEach(btn => {
        btn.addEventListener('click', () => toggleLike(btn.dataset.id));
    });
    
    // Bok likes buttons
    document.querySelectorAll('.bok-likes-btn').forEach(btn => {
        btn.addEventListener('click', () => incrementBokLikes(btn.dataset.id));
    });
}

// Toggle like status
async function toggleLike(ideaId) {
    const btn = document.querySelector(`.like-btn[data-id="${ideaId}"]`);
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
        
        const responseData = await response.json();
        
        if (!response.ok) {
            throw new Error(responseData.error || 'Failed to update like status');
        }
        
        // Update local state
        const idea = allIdeas.find(i => String(i.id) === String(ideaId));
        if (idea) {
            idea.liked = newLiked;
        }
        
    } catch (error) {
        console.error('Error toggling like:', error);
        console.error('Error details:', {
            ideaId,
            newLiked,
            error: error.message,
            stack: error.stack
        });
        // Revert on error
        btn.dataset.liked = currentLiked;
        btn.querySelector('span').textContent = currentLiked ? '❤️' : '🤍';
        btn.classList.toggle('liked', currentLiked);
        alert(`Error updating like status: ${error.message}\n\nCheck browser console for details.`);
    } finally {
        btn.disabled = false;
    }
}

// Increment bok likes
async function incrementBokLikes(ideaId) {
    const btn = document.querySelector(`.bok-likes-btn[data-id="${ideaId}"]`);
    const countEl = btn?.querySelector('.bok-count');
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
        
        if (!response.ok) {
            throw new Error('Failed to update bok likes');
        }
        
        // Update local state
        const idea = allIdeas.find(i => String(i.id) === String(ideaId));
        if (idea) {
            idea.bok_likes = newCount;
        }
        
    } catch (error) {
        console.error('Error incrementing bok likes:', error);
        // Revert on error
        countEl.textContent = currentCount;
        alert('Error updating bok likes');
    } finally {
        btn.disabled = false;
    }
}

// Render pagination controls
function renderPagination() {
    const totalPages = Math.ceil(totalIdeas / pageSize);
    
    let paginationHtml = '<div class="pagination">';
    
    if (currentPage > 0) {
        paginationHtml += `<button class="pagination-btn" onclick="goToPage(${currentPage - 1})">Previous</button>`;
    }
    
    paginationHtml += `<span class="pagination-info">Page ${currentPage + 1} of ${totalPages} (${totalIdeas} total)</span>`;
    
    if (currentPage < totalPages - 1) {
        paginationHtml += `<button class="pagination-btn" onclick="goToPage(${currentPage + 1})">Next</button>`;
    }
    
    paginationHtml += '</div>';
    
    // Remove existing pagination if any
    const existing = document.querySelector('.pagination');
    if (existing) {
        existing.remove();
    }
    
    // Add pagination after the grid
    ideasGrid.insertAdjacentHTML('afterend', paginationHtml);
}

// Go to specific page
function goToPage(page) {
    currentPage = page;
    loadDesignIdeas(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Mark idea as having unsaved changes
function markAsChanged(ideaId) {
    unsavedChanges.add(ideaId);
    const statusEl = document.getElementById(`status-${ideaId}`);
    if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.className = 'idea-status unsaved';
        statusEl.textContent = 'Unsaved changes';
    }
    updateSaveAllButton();
}

// Mark idea as saved
function markAsSaved(ideaId) {
    unsavedChanges.delete(ideaId);
    const statusEl = document.getElementById(`status-${ideaId}`);
    if (statusEl) {
        statusEl.className = 'idea-status saved';
        statusEl.textContent = 'Saved';
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 2000);
    }
    updateSaveAllButton();
}

// Update save all button state
function updateSaveAllButton() {
    if (unsavedChanges.size > 0) {
        saveAllBtn.disabled = false;
        saveAllBtn.textContent = `Save All Changes (${unsavedChanges.size})`;
    } else {
        saveAllBtn.disabled = true;
        saveAllBtn.textContent = 'Save All Changes';
    }
}

// Save a single idea
async function saveIdea(ideaId) {
    const card = document.querySelector(`.idea-card[data-id="${ideaId}"]`);
    if (!card) {
        console.error('Card not found for idea:', ideaId);
        return;
    }
    
    // Handle both UUID strings and integer IDs
    const idea = allIdeas.find(i => String(i.id) === String(ideaId));
    if (!idea) {
        console.error('Idea not found:', ideaId);
        console.error('Available IDs:', allIdeas.map(i => i.id).slice(0, 5));
        return;
    }
    
    // Collect updated values
    const nameInput = card.querySelector('.idea-name-input');
    const roomSelect = card.querySelector('.idea-room-select');
    const categoryInput = card.querySelector('.idea-category-input');
    const tagsInput = card.querySelector('.idea-tags-input');
    const saveBtn = card.querySelector('.idea-save-btn');
    const likeBtn = card.querySelector('.like-btn');
    const bokLikesBtn = card.querySelector('.bok-likes-btn');
    
    if (!nameInput || !roomSelect || !categoryInput || !tagsInput || !saveBtn) {
        console.error('Required elements not found in card');
        return;
    }
    
    const updateData = {
        name: nameInput.value.trim() || null,
        room: roomSelect.value || null,
        category: categoryInput.value.trim() || null,
        tags: tagsInput.value.trim() ? tagsInput.value.split(',').map(t => t.trim()).filter(t => t) : []
    };
    
    // Add liked and bok_likes if buttons exist
    if (likeBtn) {
        updateData.liked = likeBtn.dataset.liked === 'true';
    }
    if (bokLikesBtn) {
        const countEl = bokLikesBtn.querySelector('.bok-count');
        if (countEl) {
            updateData.bok_likes = parseInt(countEl.textContent) || 0;
        }
    }
    
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    
    try {
        console.log('Saving idea:', ideaId, updateData);
        
        const response = await fetch(`${API_BASE}/design-ideas/${ideaId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });
        
        let responseData;
        try {
            responseData = await response.json();
        } catch (e) {
            throw new Error(`Invalid response from server: ${response.status} ${response.statusText}`);
        }
        
        if (!response.ok) {
            throw new Error(responseData.error || `Failed to save: ${response.status} ${response.statusText}`);
        }
        
        // Update local state
        const index = allIdeas.findIndex(i => String(i.id) === String(ideaId));
        if (index !== -1) {
            allIdeas[index] = { ...allIdeas[index], ...responseData };
        }
        
        markAsSaved(ideaId);
        saveBtn.textContent = 'Saved!';
        setTimeout(() => {
            saveBtn.textContent = 'Save';
            saveBtn.disabled = false;
        }, 2000);
        
    } catch (error) {
        console.error('Error saving idea:', error);
        console.error('Error details:', {
            ideaId,
            updateData,
            error: error.message,
            stack: error.stack
        });
        saveBtn.textContent = 'Error';
        saveBtn.disabled = false;
        alert(`Error saving: ${error.message}\n\nCheck browser console for details.`);
    }
}

// Save all changes
async function saveAllChanges() {
    if (unsavedChanges.size === 0) return;
    
    const updates = [];
    
    unsavedChanges.forEach(ideaId => {
        const card = document.querySelector(`.idea-card[data-id="${ideaId}"]`);
        if (!card) return;
        
        const nameInput = card.querySelector('.idea-name-input');
        const roomSelect = card.querySelector('.idea-room-select');
        const categoryInput = card.querySelector('.idea-category-input');
        const tagsInput = card.querySelector('.idea-tags-input');
        
        const likeBtn = card.querySelector('.like-btn');
        const bokLikesBtn = card.querySelector('.bok-likes-btn');
        
        updates.push({
            id: ideaId, // Keep as string for UUIDs
            name: nameInput.value.trim() || null,
            room: roomSelect.value || null,
            category: categoryInput.value.trim() || null,
            tags: tagsInput.value.trim() ? tagsInput.value.split(',').map(t => t.trim()).filter(t => t) : [],
            liked: likeBtn ? likeBtn.dataset.liked === 'true' : false,
            bok_likes: bokLikesBtn ? parseInt(bokLikesBtn.querySelector('.bok-count').textContent) || 0 : 0
        });
    });
    
    saveAllBtn.disabled = true;
    saveAllBtn.textContent = 'Saving...';
    
    try {
        // Save individually (batch endpoint could be added later)
        const promises = updates.map(update => {
            const { id, ...data } = update;
            return fetch(`${API_BASE}/design-ideas/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
        });
        
        const responses = await Promise.all(promises);
        
        // Check for errors
        for (let i = 0; i < responses.length; i++) {
            if (!responses[i].ok) {
                const errorData = await responses[i].json().catch(() => ({}));
                throw new Error(`Failed to save idea ${updates[i].id}: ${errorData.error || responses[i].statusText}`);
            }
        }
        
        // Update local state
        const updatedData = await Promise.all(responses.map(r => r.json()));
        updatedData.forEach(updated => {
            const index = allIdeas.findIndex(i => String(i.id) === String(updated.id));
            if (index !== -1) {
                allIdeas[index] = updated;
            }
            markAsSaved(String(updated.id));
        });
        
        saveAllBtn.textContent = 'All Saved!';
        setTimeout(() => {
            saveAllBtn.textContent = 'Save All Changes';
            saveAllBtn.disabled = false;
        }, 2000);
        
    } catch (error) {
        console.error('Error saving all:', error);
        saveAllBtn.textContent = 'Error';
        saveAllBtn.disabled = false;
        alert(`Error saving: ${error.message}`);
    }
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
        document.body.removeChild(modal);
        document.body.style.overflow = '';
    }, 200);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
