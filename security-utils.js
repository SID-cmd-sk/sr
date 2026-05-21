/**
 * SR PLATFORM — Security Utilities
 * Centralized security functions for input validation, output encoding, etc.
 */

// ═══════════════════════════════════════════════════════════════
// INPUT VALIDATION
// ═══════════════════════════════════════════════════════════════

const VALIDATION_RULES = {
  email: {
    regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: 'Invalid email format'
  },
  phone: {
    regex: /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/,
    message: 'Invalid phone number format'
  },
  srNumber: {
    regex: /^SR-\d{4}-\d{4}$/,
    message: 'Invalid SR number format'
  },
  alphanumeric: {
    regex: /^[a-zA-Z0-9\s\-_.,]*$/,
    message: 'Only alphanumeric characters allowed'
  }
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') return false
  return VALIDATION_RULES.email.regex.test(email.trim())
}

function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return false
  return VALIDATION_RULES.phone.regex.test(phone.trim())
}

function validateSRNumber(srNumber) {
  if (!srNumber || typeof srNumber !== 'string') return false
  return VALIDATION_RULES.srNumber.regex.test(srNumber.trim())
}

function validateMaxLength(text, maxLen) {
  return text && text.toString().length <= maxLen
}

function validateMinLength(text, minLen) {
  return text && text.toString().length >= minLen
}

function validateRequired(value) {
  return value !== null && value !== undefined && value !== ''
}

function validateEnumValue(value, allowedValues) {
  return allowedValues.includes(value)
}

function validateStatusValue(status) {
  const VALID_STATUSES = ['Open', 'In Progress', 'Pending', 'Closed', 'Archived']
  return validateEnumValue(status, VALID_STATUSES)
}

function validatePriorityValue(priority) {
  const VALID_PRIORITIES = ['Low', 'Medium', 'High', 'Critical']
  return validateEnumValue(priority, VALID_PRIORITIES)
}

function validateRoleValue(role) {
  const VALID_ROLES = ['Admin', 'Manager', 'Technical', 'User', 'Viewer']
  return validateEnumValue(role, VALID_ROLES)
}

/**
 * Comprehensive form validator
 * @param {Object} data - Form data to validate
 * @param {Object} schema - Validation schema { field: { type, required, maxLen, ... } }
 * @returns {Object} { valid: boolean, errors: {} }
 */
function validateForm(data, schema) {
  const errors = {}
  
  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field]
    
    // Check required
    if (rules.required && !validateRequired(value)) {
      errors[field] = `${field} is required`
      continue
    }
    
    if (!validateRequired(value)) continue
    
    // Check type
    if (rules.type === 'email' && !validateEmail(value)) {
      errors[field] = VALIDATION_RULES.email.message
      continue
    }
    
    if (rules.type === 'phone' && !validatePhone(value)) {
      errors[field] = VALIDATION_RULES.phone.message
      continue
    }
    
    // Check length
    if (rules.maxLen && !validateMaxLength(value, rules.maxLen)) {
      errors[field] = `${field} must be ${rules.maxLen} characters or less`
      continue
    }
    
    if (rules.minLen && !validateMinLength(value, rules.minLen)) {
      errors[field] = `${field} must be at least ${rules.minLen} characters`
      continue
    }
    
    // Check enum
    if (rules.enum && !validateEnumValue(value, rules.enum)) {
      errors[field] = `${field} must be one of: ${rules.enum.join(', ')}`
      continue
    }
    
    // Custom validator
    if (rules.custom && typeof rules.custom === 'function') {
      if (!rules.custom(value)) {
        errors[field] = rules.customMessage || `${field} is invalid`
      }
    }
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors
  }
}

// ═══════════════════════════════════════════════════════════════
// OUTPUT ENCODING & ESCAPING
// ═══════════════════════════════════════════════════════════════

/**
 * Escape HTML special characters
 * Prevents XSS by encoding: <, >, ", ', &
 */
function escapeHtml(text) {
  if (!text) return ''
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.toString().replace(/[&<>"']/g, char => map[char])
}

// Alias for backward compatibility
const escHtml = escapeHtml

/**
 * Sanitize URL to prevent javascript: and data: URIs
 */
function sanitizeUrl(url) {
  if (!url) return ''
  try {
    const parsed = new URL(url, window.location.origin)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return ''  // Reject javascript:, data:, etc.
    }
    return parsed.toString()
  } catch (e) {
    return ''
  }
}

/**
 * Create safe innerHTML by whitelisting tags
 * Only allows: p, br, strong, em, u, a, li, ul, ol
 */
function sanitizeHtml(html) {
  const whitelist = ['p', 'br', 'strong', 'em', 'u', 'li', 'ul', 'ol', 'a']
  const div = document.createElement('div')
  div.innerHTML = html
  
  function sanitizeNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return true
    
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (!whitelist.includes(node.tagName.toLowerCase())) {
        return false  // Remove this node
      }
      
      // For <a> tags, ensure href is safe
      if (node.tagName.toLowerCase() === 'a') {
        const href = node.getAttribute('href')
        node.setAttribute('href', sanitizeUrl(href))
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      }
      
      // Recursively sanitize children
      const children = Array.from(node.childNodes)
      for (const child of children) {
        if (!sanitizeNode(child)) {
          node.removeChild(child)
        }
      }
      return true
    }
    
    return false
  }
  
  const children = Array.from(div.childNodes)
  for (const child of children) {
    if (!sanitizeNode(child)) {
      div.removeChild(child)
    }
  }
  
  return div.innerHTML
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION LOADING
// ═══════════════════════════════════════════════════════════════

let CONFIG_CACHE = null

/**
 * Load safe configuration from backend
 * Never loads secrets from frontend
 */
async function loadSafeConfig() {
  if (CONFIG_CACHE) return CONFIG_CACHE
  
  try {
    // In production, this would call a backend API endpoint
    // For now, we'll load from environment variables (Vite)
    CONFIG_CACHE = {
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      appsScriptUrl: import.meta.env.VITE_APPS_SCRIPT_URL,
      driveFolderId: import.meta.env.VITE_DRIVE_SR_FOLDER_ID,
      activitiesFolderId: import.meta.env.VITE_DRIVE_ACTIVITIES_FOLDER_ID,
      spreadsheetId: import.meta.env.VITE_DRIVE_SPREADSHEET_ID,
      srSheetName: import.meta.env.VITE_DRIVE_SR_SHEET_NAME,
      activitySheetName: import.meta.env.VITE_DRIVE_ACTIVITY_SHEET_NAME,
      waBridgeUrl: import.meta.env.VITE_WA_BRIDGE_URL,
    }
    
    // Validate that critical values are present
    if (!CONFIG_CACHE.supabaseUrl || !CONFIG_CACHE.supabaseAnonKey) {
      throw new Error('Missing required Supabase configuration')
    }
    
    return CONFIG_CACHE
  } catch (error) {
    console.error('Failed to load configuration:', error)
    throw error
  }
}

// ═══════════════════════════════════════════════════════════════
// DEVICE FINGERPRINTING & SESSION SECURITY
// ═══════════════════════════════════════════════════════════════

/**
 * Create a device fingerprint to detect session hijacking
 */
async function generateDeviceFingerprint() {
  const components = [
    navigator.userAgent,
    navigator.language,
    navigator.hardwareConcurrency || 'unknown',
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    // Font list (basic - not perfect but helps)
    (function() {
      const baseFonts = ['monospace', 'sans-serif', 'serif']
      const testFonts = ['Arial', 'Verdana', 'Courier New', 'Times New Roman', 'Georgia', 'Palatino']
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const text = 'mmmmmmmmmmlli'
      const textSize = '72px'
      
      let detected = []
      for (const baseFont of baseFonts) {
        ctx.font = `${textSize} ${baseFont}`
        const baseWidth = ctx.measureText(text).width
        
        for (const testFont of testFonts) {
          ctx.font = `${textSize} "${testFont}", ${baseFont}`
          const testWidth = ctx.measureText(text).width
          if (testWidth !== baseWidth) {
            detected.push(testFont)
          }
        }
      }
      return detected.join(',')
    })()
  ].join('|')
  
  // Create SHA256 hash of fingerprint
  const encoder = new TextEncoder()
  const data = encoder.encode(components)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Get current user's IP address (for session security)
 * Note: This is client-side and can be spoofed; use server IP for true security
 */
async function getUserIpAddress() {
  try {
    const response = await fetch('https://api.ipify.org?format=json')
    const data = await response.json()
    return data.ip
  } catch (error) {
    console.warn('Could not fetch IP address:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
// SECURITY HEADERS
// ═══════════════════════════════════════════════════════════════

const SECURITY_HEADERS = {
  'Content-Security-Policy': `default-src 'self'; 
    script-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com; 
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; 
    font-src https://fonts.gstatic.com; 
    img-src 'self' data: https:; 
    connect-src 'self' https:; 
    frame-ancestors 'none'; 
    base-uri 'self'; 
    form-action 'self'`,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
}

// Export all functions
window.SecurityUtils = {
  // Validation
  validateEmail, validatePhone, validateSRNumber,
  validateMaxLength, validateMinLength, validateRequired,
  validateStatusValue, validatePriorityValue, validateRoleValue,
  validateForm,
  
  // Encoding
  escapeHtml, escHtml, sanitizeUrl, sanitizeHtml,
  
  // Configuration
  loadSafeConfig,
  
  // Session Security
  generateDeviceFingerprint, getUserIpAddress,
  
  // Headers
  SECURITY_HEADERS
}
