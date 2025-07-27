class ErrorMonitor {
  constructor() {
    this.errors = [];
    this.showResolved = false;
    this.currentResolvingIndex = null;
    this.currentResolvingId = null;
    this.errorTypes = [];
    this.categories = [];
    this.selectedCategory = 'all';
    this.authToken = localStorage.getItem('authToken');
    this.userData = JSON.parse(localStorage.getItem('userData') || '{}');
    this.init();
  }

  async init() {
    // Check authentication
    if (!this.authToken) {
      window.location.href = '/';
      return;
    }

    // Verify token is still valid
    const isValid = await this.verifyToken();
    if (!isValid) {
      this.logout();
      return;
    }

    this.displayUserInfo();
    await this.loadErrorTypes();
    this.extractCategories();
    this.renderCategories();
    await this.loadErrorsFromDatabase();
    this.bindEvents();
    this.updateStats();
    this.updateCategoriesStats();
  }

  async verifyToken() {
    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        this.userData = data.user;
        localStorage.setItem('userData', JSON.stringify(data.user));
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      return false;
    }
  }

  displayUserInfo() {
    // Add user info to the header
    const header = document.querySelector('header');
    const userInfo = document.createElement('div');
    userInfo.className = 'user-info';
    userInfo.innerHTML = `
            <div class="user-details">
                <span class="user-name">👋 ${this.userData.firstName} ${this.userData.lastName}</span>
                <span class="user-role">${this.userData.role}</span>
            </div>
            <button id="logout-btn" class="btn btn-secondary btn-small">Logout</button>
        `;
    header.appendChild(userInfo);

    // Add logout functionality
    document.getElementById('logout-btn').addEventListener('click', () => {
      this.logout();
    });
  }

  logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    window.location.href = '/';
  }

  async makeAuthenticatedRequest(url, options = {}) {
    const defaultOptions = {
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const response = await fetch(url, { ...defaultOptions, ...options });

    if (response.status === 401) {
      // Token expired or invalid
      this.logout();
      return null;
    }

    return response;
  }

  async loadErrorTypes() {
    try {
      const response = await fetch('/data/errors.json');
      const data = await response.json();
      this.errorTypes = data.errorTypes;
      console.log(`Loaded ${this.errorTypes.length} error types from external source`);
    } catch (error) {
      console.error('Failed to load error types:', error);
      // Fallback to hardcoded errors if JSON fails to load
      this.errorTypes = [
        { message: "Database connection timeout", severity: "high", category: "database" },
        { message: "API rate limit exceeded", severity: "medium", category: "api" },
        { message: "Network request failed", severity: "medium", category: "network" }
      ];
    }
  }

  async loadErrorsFromDatabase() {
    try {
      const response = await this.makeAuthenticatedRequest('/api/errors?limit=100');
      if (response && response.ok) {
        this.errors = await response.json();
        console.log(`Loaded ${this.errors.length} errors from database`);
        this.renderErrors();
        this.updateStats();
        this.updateCategoriesStats();
      }
    } catch (error) {
      console.error('Failed to load errors from database:', error);
    }
  }

  extractCategories() {
    const categorySet = new Set();
    this.errorTypes.forEach(errorType => {
      if (errorType.category) {
        categorySet.add(errorType.category);
      }
    });
    this.categories = Array.from(categorySet).sort();
    console.log(`Found categories: ${this.categories.join(', ')}`);
  }

  renderCategories() {
    const categoryButtonsContainer = document.getElementById('category-buttons');

    // Create category filter buttons
    categoryButtonsContainer.innerHTML = this.categories.map(category =>
      `<button class="category-filter" data-category="${category}">${category}</button>`
    ).join('');

    // Render categories stats
    this.updateCategoriesStats();
  }

  updateCategoriesStats() {
    const categoriesStatsContainer = document.getElementById('categories-stats');

    const categoryStats = this.categories.map(category => {
      const categoryErrors = this.errors.filter(error =>
        error.category === category && (!this.showResolved ? !error.resolved : true)
      );
      const unresolvedCount = categoryErrors.filter(error => !error.resolved).length;

      return {
        name: category,
        total: categoryErrors.length,
        unresolved: unresolvedCount,
        hasErrors: unresolvedCount > 0
      };
    });

    categoriesStatsContainer.innerHTML = categoryStats.map(stat => `
            <div class="category-stat ${stat.hasErrors ? 'has-errors' : ''}">
                <div class="category-stat-name">${stat.name}</div>
                <div class="category-stat-count">${stat.unresolved}</div>
            </div>
        `).join('');
  }

  bindEvents() {
    document.getElementById('simulate-error').addEventListener('click', () => {
      this.simulateError();
    });

    document.getElementById('clear-errors').addEventListener('click', () => {
      this.clearErrors();
    });

    document.getElementById('refresh').addEventListener('click', () => {
      this.refreshData();
    });

    document.getElementById('show-resolved').addEventListener('change', (e) => {
      this.showResolved = e.target.checked;
      this.renderErrors();
      this.updateCategoriesStats();
    });

    // Category filter events
    document.getElementById('filter-all').addEventListener('click', () => {
      this.setCategory('all');
    });

    document.getElementById('category-buttons').addEventListener('click', (e) => {
      if (e.target.classList.contains('category-filter')) {
        this.setCategory(e.target.dataset.category);
      }
    });

    // Modal events
    document.getElementById('cancel-resolve').addEventListener('click', () => {
      this.closeResolveModal();
    });

    document.getElementById('confirm-resolve').addEventListener('click', () => {
      this.confirmResolve();
    });

    // Close modal when clicking outside
    document.getElementById('resolve-modal').addEventListener('click', (e) => {
      if (e.target.id === 'resolve-modal') {
        this.closeResolveModal();
      }
    });
  }

  setCategory(category) {
    this.selectedCategory = category;

    // Update active button
    document.querySelectorAll('.category-filter').forEach(btn => {
      btn.classList.remove('active');
    });

    if (category === 'all') {
      document.getElementById('filter-all').classList.add('active');
    } else {
      document.querySelector(`[data-category="${category}"]`).classList.add('active');
    }

    // Update filter display
    const filterText = category === 'all' ? 'All Categories' : category.charAt(0).toUpperCase() + category.slice(1);
    document.getElementById('current-filter').textContent = `Showing: ${filterText}`;

    this.renderErrors();
  }

  async simulateError() {
    if (this.errorTypes.length === 0) {
      console.error('No error types available');
      return;
    }

    const randomErrorType = this.errorTypes[Math.floor(Math.random() * this.errorTypes.length)];

    const errorData = {
      message: randomErrorType.message,
      severity: randomErrorType.severity,
      category: randomErrorType.category,
      description: randomErrorType.description || 'No description available',
      stack: `Error: ${randomErrorType.message}\n    at Object.<anonymous> (/app/server.js:23:15)`,
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    try {
      const response = await this.makeAuthenticatedRequest('/api/errors', {
        method: 'POST',
        body: JSON.stringify(errorData)
      });

      if (response && response.ok) {
        const result = await response.json();
        console.log('Error saved to database:', result.error.id);

        // Reload errors from database to get the latest data
        await this.loadErrorsFromDatabase();
      }
    } catch (error) {
      console.error('Failed to send error:', error);
    }
  }

  openResolveModal(errorId) {
    this.currentResolvingId = errorId;
    const error = this.errors.find(e => e.id === errorId);

    if (!error) {
      console.error('Error not found:', errorId);
      return;
    }

    document.getElementById('resolve-error-message').textContent = `"${error.message}"`;
    document.getElementById('resolve-comment').value = '';
    document.getElementById('resolve-modal').classList.remove('hidden');
    document.getElementById('resolve-comment').focus();
  }

  closeResolveModal() {
    document.getElementById('resolve-modal').classList.add('hidden');
    this.currentResolvingId = null;
  }

  async confirmResolve() {
    const comment = document.getElementById('resolve-comment').value.trim();

    if (!comment) {
      alert('Please add a comment about how this error was resolved.');
      return;
    }

    if (!this.currentResolvingId) {
      console.error('No error selected for resolving');
      return;
    }

    try {
      const response = await this.makeAuthenticatedRequest(`/api/errors/${this.currentResolvingId}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({
          resolveComment: comment,
          resolvedBy: `${this.userData.firstName} ${this.userData.lastName}`
        })
      });

      if (response && response.ok) {
        const result = await response.json();
        console.log('Error resolved in database:', result.error.id);

        // Update the local error object
        const errorIndex = this.errors.findIndex(e => e.id === this.currentResolvingId);
        if (errorIndex !== -1) {
          this.errors[errorIndex] = result.error;
        }

        this.renderErrors();
        this.updateStats();
        this.updateCategoriesStats();
        this.closeResolveModal();
      } else {
        console.error('Failed to resolve error:', response ? await response.text() : 'No response');
        alert('Failed to resolve error. Please try again.');
      }
    } catch (error) {
      console.error('Error resolving error:', error);
      alert('Failed to resolve error. Please try again.');
    }
  }

  async unresolveError(errorId) {
    if (!confirm('Are you sure you want to mark this error as unresolved?')) {
      return;
    }

    try {
      const response = await this.makeAuthenticatedRequest(`/api/errors/${errorId}/unresolve`, {
        method: 'PATCH'
      });

      if (response && response.ok) {
        const result = await response.json();
        console.log('Error unresolved in database:', result.error.id);

        // Update the local error object
        const errorIndex = this.errors.findIndex(e => e.id === errorId);
        if (errorIndex !== -1) {
          this.errors[errorIndex] = result.error;
        }

        this.renderErrors();
        this.updateStats();
        this.updateCategoriesStats();
      } else {
        console.error('Failed to unresolve error:', response ? await response.text() : 'No response');
        alert('Failed to unresolve error. Please try again.');
      }
    } catch (error) {
      console.error('Error unresolving error:', error);
      alert('Failed to unresolve error. Please try again.');
    }
  }

  async clearErrors() {
    if (!confirm('Are you sure you want to delete all errors? This cannot be undone.')) {
      return;
    }

    try {
      const response = await this.makeAuthenticatedRequest('/api/errors', {
        method: 'DELETE'
      });

      if (response && response.ok) {
        const result = await response.json();
        console.log(`Deleted ${result.deletedCount} errors from database`);

        this.errors = [];
        this.renderErrors();
        this.updateStats();
        this.updateCategoriesStats();
      } else {
        console.error('Failed to clear errors:', response ? await response.text() : 'No response');
        alert('Failed to clear errors. Please try again.');
      }
    } catch (error) {
      console.error('Error clearing errors:', error);
      alert('Failed to clear errors. Please try again.');
    }
  }

  async refreshData() {
    console.log('Refreshing data from database...');
    await this.loadErrorsFromDatabase();
  }

  renderErrors() {
    const container = document.getElementById('errors-container');

    // Filter errors based on showResolved checkbox and selected category
    let filteredErrors = this.errors;

    if (!this.showResolved) {
      filteredErrors = filteredErrors.filter(error => !error.resolved);
    }

    if (this.selectedCategory !== 'all') {
      filteredErrors = filteredErrors.filter(error => error.category === this.selectedCategory);
    }

    if (filteredErrors.length === 0) {
      let message;
      if (this.errors.length === 0) {
        message = 'No errors reported yet. Click "Simulate Error" to test!';
      } else if (this.selectedCategory !== 'all') {
        message = `No ${this.showResolved ? '' : 'unresolved '}errors found in "${this.selectedCategory}" category.`;
      } else {
        message = 'No unresolved errors! Check "Show Resolved" to see resolved errors.';
      }
      container.innerHTML = `<p class="no-errors">${message}</p>`;
      return;
    }

    container.innerHTML = filteredErrors.map((error) => {
      const resolvedClass = error.resolved ? 'resolved' : '';
      const resolvedBadge = error.resolved ? '<div class="resolved-badge">✓ RESOLVED</div>' : '';

      // Severity badge styling
      const severityClass = {
        'critical': 'severity-critical',
        'high': 'severity-high',
        'medium': 'severity-medium',
        'low': 'severity-low'
      }[error.severity] || 'severity-unknown';

      const resolveComment = error.resolved && error.resolve_comment ? `
                <div class="resolve-comment">
                    <strong>Resolution:</strong> ${error.resolve_comment}<br>
                    <small>Resolved on ${new Date(error.resolved_at).toLocaleString()} by ${error.resolved_by}</small>
                </div>
            ` : '';

      const actionButtons = error.resolved ? `
                <button class="btn btn-small btn-info" onclick="errorMonitor.unresolveError('${error.id}')">
                    Unresolve
                </button>
            ` : `
                <button class="btn btn-small btn-success" onclick="errorMonitor.openResolveModal('${error.id}')">
                    ✓ Resolve
                </button>
            `;

      return `
                <div class="error-item ${resolvedClass}">
                    ${resolvedBadge}
                    <div class="error-header">
                        <div class="error-message">${error.message}</div>
                        <div class="error-badges">
                            <span class="severity-badge ${severityClass}">${error.severity?.toUpperCase() || 'UNKNOWN'}</span>
                            <span class="category-badge">${error.category?.toUpperCase() || 'GENERAL'}</span>
                        </div>
                    </div>
                    <div class="error-description">${error.description || 'No description available'}</div>
                    <div class="error-details">
                        <strong>Time:</strong> ${new Date(error.created_at).toLocaleString()}<br>
                        <strong>URL:</strong> ${error.url}<br>
                        <strong>Category:</strong> ${error.category || 'General'}
                    </div>
                    ${resolveComment}
                    <div class="error-actions">
                        ${actionButtons}
                    </div>
                </div>
            `;
    }).join('');
  }

  updateStats() {
    const totalErrors = this.errors.length;
    const unresolvedErrors = this.errors.filter(error => !error.resolved).length;

    document.getElementById('total-errors').textContent = totalErrors;
    document.getElementById('unresolved-errors').textContent = unresolvedErrors;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentErrors = this.errors.filter(error =>
      new Date(error.created_at) > oneHourAgo && !error.resolved
    );
    document.getElementById('recent-errors').textContent = recentErrors.length;

    const status = unresolvedErrors > 10 ? 'Critical' :
      unresolvedErrors > 5 ? 'Warning' : 'Healthy';
    document.getElementById('system-status').textContent = status;
  }
}

// Global reference for onclick handlers
let errorMonitor;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  errorMonitor = new ErrorMonitor();
});