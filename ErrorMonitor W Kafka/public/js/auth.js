class AuthManager {
  constructor() {
    this.currentTab = 'login';
    this.init();
  }

  init() {
    this.bindEvents();
    this.checkExistingAuth();
  }

  bindEvents() {
    // Tab switching
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Form submissions
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    document.getElementById('register-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleRegister();
    });

    // Demo login
    document.getElementById('demo-login').addEventListener('click', () => {
      this.handleDemoLogin();
    });

    // Real-time validation
    document.getElementById('register-password').addEventListener('input', (e) => {
      this.checkPasswordStrength(e.target.value);
    });

    document.getElementById('register-confirm-password').addEventListener('input', (e) => {
      this.validatePasswordMatch();
    });

    // Email validation
    document.getElementById('register-email').addEventListener('blur', (e) => {
      this.validateEmail(e.target.value, 'register');
    });

    document.getElementById('login-email').addEventListener('blur', (e) => {
      this.validateEmail(e.target.value, 'login');
    });
  }

  switchTab(tab) {
    this.currentTab = tab;

    // Update tab buttons
    document.querySelectorAll('.auth-tab').forEach(t => {
      t.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

    // Update forms
    document.querySelectorAll('.auth-form').forEach(form => {
      form.classList.remove('active');
    });
    document.getElementById(`${tab}-form`).classList.add('active');

    // Clear any alerts
    this.clearAlert();
  }

  async handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    // Client-side validation
    if (!this.validateLoginForm(email, password)) {
      return;
    }

    this.setLoading('login', true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok) {
        this.showAlert('Login successful! Redirecting...', 'success');

        // Store token and user data
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('userData', JSON.stringify(data.user));

        // Redirect to dashboard
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1000);

      } else {
        this.showAlert(data.error || 'Login failed', 'error');
        if (data.details) {
          this.showValidationErrors(data.details, 'login');
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      this.showAlert('Network error. Please try again.', 'error');
    } finally {
      this.setLoading('login', false);
    }
  }

  async handleRegister() {
    const formData = {
      firstName: document.getElementById('register-firstname').value.trim(),
      lastName: document.getElementById('register-lastname').value.trim(),
      email: document.getElementById('register-email').value.trim(),
      password: document.getElementById('register-password').value,
      confirmPassword: document.getElementById('register-confirm-password').value
    };

    // Client-side validation
    if (!this.validateRegisterForm(formData)) {
      return;
    }

    this.setLoading('register', true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        this.showAlert('Account created successfully! Redirecting...', 'success');

        // Store token and user data
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('userData', JSON.stringify(data.user));

        // Redirect to dashboard
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1500);

      } else {
        this.showAlert(data.error || 'Registration failed', 'error');
        if (data.details) {
          this.showValidationErrors(data.details, 'register');
        }
      }
    } catch (error) {
      console.error('Registration error:', error);
      this.showAlert('Network error. Please try again.', 'error');
    } finally {
      this.setLoading('register', false);
    }
  }

  async handleDemoLogin() {
    // Create demo account if it doesn't exist, then login
    this.setLoading('demo', true);

    try {
      // Try to login with demo account first
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'demo@errormonitor.com',
          password: 'Demo123!'
        })
      });

      let data = await loginResponse.json();

      if (!loginResponse.ok) {
        // Demo account doesn't exist, create it
        const registerResponse = await fetch('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            firstName: 'Demo',
            lastName: 'User',
            email: 'demo@errormonitor.com',
            password: 'Demo123!',
            confirmPassword: 'Demo123!'
          })
        });

        data = await registerResponse.json();

        if (!registerResponse.ok) {
          throw new Error(data.error || 'Failed to create demo account');
        }
      }

      this.showAlert('Demo login successful! Redirecting...', 'success');

      // Store token and user data
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('userData', JSON.stringify(data.user));

      // Redirect to dashboard
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1000);

    } catch (error) {
      console.error('Demo login error:', error);
      this.showAlert('Failed to access demo account', 'error');
    } finally {
      this.setLoading('demo', false);
    }
  }

  validateLoginForm(email, password) {
    let isValid = true;

    // Email validation
    if (!email) {
      this.showFieldError('login-email', 'Email is required');
      isValid = false;
    } else if (!this.isValidEmail(email)) {
      this.showFieldError('login-email', 'Please enter a valid email');
      isValid = false;
    } else {
      this.clearFieldError('login-email');
    }

    // Password validation
    if (!password) {
      this.showFieldError('login-password', 'Password is required');
      isValid = false;
    } else if (password.length < 6) {
      this.showFieldError('login-password', 'Password must be at least 6 characters');
      isValid = false;
    } else {
      this.clearFieldError('login-password');
    }

    return isValid;
  }

  validateRegisterForm(data) {
    let isValid = true;

    // First name validation
    if (!data.firstName) {
      this.showFieldError('register-firstname', 'First name is required');
      isValid = false;
    } else if (data.firstName.length < 2) {
      this.showFieldError('register-firstname', 'First name must be at least 2 characters');
      isValid = false;
    } else {
      this.clearFieldError('register-firstname');
    }

    // Last name validation
    if (!data.lastName) {
      this.showFieldError('register-lastname', 'Last name is required');
      isValid = false;
    } else if (data.lastName.length < 2) {
      this.showFieldError('register-lastname', 'Last name must be at least 2 characters');
      isValid = false;
    } else {
      this.clearFieldError('register-lastname');
    }

    // Email validation
    if (!data.email) {
      this.showFieldError('register-email', 'Email is required');
      isValid = false;
    } else if (!this.isValidEmail(data.email)) {
      this.showFieldError('register-email', 'Please enter a valid email');
      isValid = false;
    } else {
      this.clearFieldError('register-email');
    }

    // Password validation
    if (!data.password) {
      this.showFieldError('register-password', 'Password is required');
      isValid = false;
    } else if (!this.isStrongPassword(data.password)) {
      this.showFieldError('register-password', 'Password must contain uppercase, lowercase, and number');
      isValid = false;
    } else {
      this.clearFieldError('register-password');
    }

    // Confirm password validation
    if (!data.confirmPassword) {
      this.showFieldError('register-confirm-password', 'Password confirmation is required');
      isValid = false;
    } else if (data.password !== data.confirmPassword) {
      this.showFieldError('register-confirm-password', 'Passwords do not match');
      isValid = false;
    } else {
      this.clearFieldError('register-confirm-password');
    }

    return isValid;
  }

  validateEmail(email, formType) {
    if (email && !this.isValidEmail(email)) {
      this.showFieldError(`${formType}-email`, 'Please enter a valid email');
      return false;
    } else {
      this.clearFieldError(`${formType}-email`);
      return true;
    }
  }

  validatePasswordMatch() {
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;

    if (confirmPassword && password !== confirmPassword) {
      this.showFieldError('register-confirm-password', 'Passwords do not match');
      return false;
    } else {
      this.clearFieldError('register-confirm-password');
      return true;
    }
  }

  checkPasswordStrength(password) {
    const strengthIndicator = document.getElementById('password-strength');
    const strengthFill = document.getElementById('strength-fill');
    const strengthText = document.getElementById('strength-text');

    if (!password) {
      strengthIndicator.classList.remove('show');
      return;
    }

    strengthIndicator.classList.add('show');

    let score = 0;
    let feedback = '';

    // Length check
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;

    // Character variety
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    // Remove existing strength classes
    strengthFill.className = 'strength-fill';

    if (score < 3) {
      strengthFill.classList.add('strength-weak');
      feedback = 'Weak - Add uppercase, numbers, symbols';
    } else if (score < 4) {
      strengthFill.classList.add('strength-fair');
      feedback = 'Fair - Consider adding more variety';
    } else if (score < 5) {
      strengthFill.classList.add('strength-good');
      feedback = 'Good - Strong password';
    } else {
      strengthFill.classList.add('strength-strong');
      feedback = 'Excellent - Very strong password';
    }

    strengthText.textContent = feedback;
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isStrongPassword(password) {
    // At least 8 characters, with uppercase, lowercase, and number
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,}$/;
    return strongPasswordRegex.test(password);
  }

  showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorElement = document.getElementById(`${fieldId}-error`);

    field.classList.add('error');
    errorElement.textContent = message;
    errorElement.classList.add('show');
  }

  clearFieldError(fieldId) {
    const field = document.getElementById(fieldId);
    const errorElement = document.getElementById(`${fieldId}-error`);

    field.classList.remove('error');
    errorElement.classList.remove('show');
  }

  showValidationErrors(errors, formType) {
    errors.forEach(error => {
      if (error.includes('email')) {
        this.showFieldError(`${formType}-email`, error);
      } else if (error.includes('password')) {
        this.showFieldError(`${formType}-password`, error);
      } else if (error.includes('First name')) {
        this.showFieldError('register-firstname', error);
      } else if (error.includes('Last name')) {
        this.showFieldError('register-lastname', error);
      }
    });
  }

  showAlert(message, type = 'error') {
    const alertContainer = document.getElementById('alert-container');
    alertContainer.innerHTML = `
            <div class="alert alert-${type}">
                ${message}
            </div>
        `;

    // Auto-hide success messages
    if (type === 'success') {
      setTimeout(() => {
        this.clearAlert();
      }, 3000);
    }
  }

  clearAlert() {
    document.getElementById('alert-container').innerHTML = '';
  }

  setLoading(buttonType, isLoading) {
    let button, buttonText;

    if (buttonType === 'login') {
      button = document.getElementById('login-button');
      buttonText = 'Sign In';
    } else if (buttonType === 'register') {
      button = document.getElementById('register-button');
      buttonText = 'Create Account';
    } else if (buttonType === 'demo') {
      button = document.getElementById('demo-login');
      buttonText = 'Use Demo Account';
    }

    if (isLoading) {
      button.disabled = true;
      button.innerHTML = `
                <span class="loading-spinner"></span>
                Processing...
            `;
    } else {
      button.disabled = false;
      button.innerHTML = `<span class="button-text">${buttonText}</span>`;
    }
  }

  checkExistingAuth() {
    const token = localStorage.getItem('authToken');
    if (token) {
      // User is already logged in, redirect to dashboard
      window.location.href = '/dashboard';
    }
  }
}

// Initialize authentication manager when page loads
document.addEventListener('DOMContentLoaded', () => {
  new AuthManager();
});