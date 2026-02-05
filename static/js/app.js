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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadPlans();
    roomFilter.addEventListener('change', filterPlans);
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
            <div class="plan-card" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                <p style="color: var(--text-secondary); font-size: 1.125rem;">
                    No plans found. Add some renovation ideas to get started!
                </p>
            </div>
        `;
        return;
    }
    
    plansGrid.innerHTML = filteredPlans.map(plan => `
        <div class="plan-card">
            <div class="plan-header">
                <span class="plan-room">${escapeHtml(plan.room || 'General')}</span>
            </div>
            <h2 class="plan-title">${escapeHtml(plan.title || 'Untitled')}</h2>
            ${plan.description ? `<p class="plan-description">${escapeHtml(plan.description)}</p>` : ''}
            ${plan.image_url ? `<img src="${escapeHtml(plan.image_url)}" alt="${escapeHtml(plan.title || 'Plan image')}" class="plan-image" onerror="this.style.display='none'">` : ''}
            ${plan.tags && plan.tags.length > 0 ? `
                <div class="plan-tags">
                    ${plan.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                </div>
            ` : ''}
            ${plan.source_url ? `<p style="margin-top: 1rem;"><a href="${escapeHtml(plan.source_url)}" target="_blank" rel="noopener noreferrer" style="color: var(--primary-color); text-decoration: none;">View Source →</a></p>` : ''}
        </div>
    `).join('');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
