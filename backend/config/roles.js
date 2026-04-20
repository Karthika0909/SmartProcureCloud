// Role mapping — email to role
// Azure AD Free tier workaround — roles mapped in code
const userRoles = {
  'admin@ravichandrankarthikagmail.onmicrosoft.com':    'Admin',
  'qs@ravichandrankarthikagmail.onmicrosoft.com':       'qs',
  'readonly@ravichandrankarthikagmail.onmicrosoft.com': 'readonly',
  'accounts@ravichandrankarthikagmail.onmicrosoft.com': 'accounts'
};

const getRoleForUser = (email) => {
  if (!email) return 'Viewer';
  return userRoles[email.toLowerCase()] || 'Viewer';
};

module.exports = { getRoleForUser };
