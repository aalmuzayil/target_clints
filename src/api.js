const ADMIN_KEY = 'aktham_admin_token'
const PHONE_KEY = 'aktham_phone_token'
const PHONE_NUM = 'aktham_phone_number'
const PHONE_NAME = 'aktham_phone_name'

export const getAdminToken = () => localStorage.getItem(ADMIN_KEY)
export const setAdminToken = (t) => localStorage.setItem(ADMIN_KEY, t)
export const clearAdminToken = () => localStorage.removeItem(ADMIN_KEY)

export const getPhoneToken = () => localStorage.getItem(PHONE_KEY)
export const getPhoneNumber = () => localStorage.getItem(PHONE_NUM)
export const getPhoneName = () => localStorage.getItem(PHONE_NAME) || ''
export const setPhoneSession = (t, phone, name = '') => {
  localStorage.setItem(PHONE_KEY, t)
  localStorage.setItem(PHONE_NUM, phone)
  localStorage.setItem(PHONE_NAME, name || '')
}
export const clearPhoneSession = () => {
  localStorage.removeItem(PHONE_KEY)
  localStorage.removeItem(PHONE_NUM)
  localStorage.removeItem(PHONE_NAME)
}

async function handle(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'حدث خطأ')
  return data
}
const req = (url, opts) => fetch(url, opts).then(handle)
const adminH = () => ({ Authorization: `Bearer ${getAdminToken()}` })
const phoneH = () => ({ Authorization: `Bearer ${getPhoneToken()}` })

// ---- public catalog ----
export const listCompanies = () => req('/api/companies')
export const listCategories = () => req('/api/companies/categories')
export const publicSettings = () => req('/api/public-settings')
export const getCompany = (id) => req(`/api/companies/${id}`)

// ---- phone auth ----
export const requestOtp = (phone, name = '') =>
  req('/api/auth/request-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, name }) })
export const verifyOtp = (phone, code, name = '') =>
  req('/api/auth/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code, name }) })

// ---- user actions ----
export const reserveCompany = (id, message = '') =>
  req(`/api/companies/${id}/reserve`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...phoneH() }, body: JSON.stringify({ message }) })
export const submitCompany = (name, category = '', force = false) =>
  req('/api/companies/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', ...phoneH() }, body: JSON.stringify({ name, category, force }) })
export const submitLead = (id, phone) =>
  req(`/api/companies/${id}/lead`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...phoneH() }, body: JSON.stringify({ phone }) })
export const submitComment = (id, comment) =>
  req(`/api/companies/${id}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...phoneH() }, body: JSON.stringify({ comment }) })
export const myCompanies = () => req('/api/me/companies', { headers: phoneH() })

// ---- admin auth ----
export const adminLogin = (email, password) =>
  req('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })

// ---- admin: companies ----
export const adminListCompanies = () => req('/api/admin/companies', { headers: adminH() })
export const adminPending = () => req('/api/admin/pending-companies', { headers: adminH() })
export const adminCreate = (fd) => req('/api/agencies', { method: 'POST', headers: adminH(), body: fd })
export const adminUpdate = (id, fd) => req(`/api/agencies/${id}`, { method: 'PUT', headers: adminH(), body: fd })
export const adminDelete = (id) => req(`/api/agencies/${id}`, { method: 'DELETE', headers: adminH() })
export const adminApproveCompany = (id) => req(`/api/admin/companies/${id}/approve`, { method: 'POST', headers: adminH() })
export const adminSetStatus = (id, status) =>
  req(`/api/admin/companies/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminH() }, body: JSON.stringify({ status }) })
export const adminSetDeadline = (id, deadline) =>
  req(`/api/admin/companies/${id}/deadline`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminH() }, body: JSON.stringify({ deadline }) })
export const adminAssign = (id, phone) =>
  req(`/api/admin/companies/${id}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminH() }, body: JSON.stringify({ phone }) })
export const adminUnassign = (id, phone) =>
  req(`/api/admin/companies/${id}/unassign`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminH() }, body: JSON.stringify({ phone }) })
export const adminAssignments = (id) => req(`/api/admin/companies/${id}/assignments`, { headers: adminH() })

// ---- admin: reservations ----
export const adminReservations = (status) =>
  req(`/api/admin/reservations${status ? `?status=${status}` : ''}`, { headers: adminH() })
export const adminApproveReservation = (id) =>
  req(`/api/admin/reservations/${id}/approve`, { method: 'POST', headers: adminH() })
export const adminRejectReservation = (id) =>
  req(`/api/admin/reservations/${id}/reject`, { method: 'POST', headers: adminH() })

// ---- admin: access control (allowlist) ----
export const adminAccess = (status) =>
  req(`/api/admin/access${status ? `?status=${status}` : ''}`, { headers: adminH() })
export const adminAddAccess = (phone, name = '', nickname = '') =>
  req('/api/admin/access', { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminH() }, body: JSON.stringify({ phone, name, nickname }) })
export const adminApproveAccess = (phone) =>
  req(`/api/admin/access/${phone}/approve`, { method: 'POST', headers: adminH() })
export const adminRejectAccess = (phone) =>
  req(`/api/admin/access/${phone}/reject`, { method: 'POST', headers: adminH() })
export const adminRemoveAccess = (phone) =>
  req(`/api/admin/access/${phone}`, { method: 'DELETE', headers: adminH() })
export const adminUserCompanies = (phone) =>
  req(`/api/admin/users/${phone}/companies`, { headers: adminH() })
export const adminAssignUser = (phone, company_id) =>
  req(`/api/admin/users/${phone}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminH() }, body: JSON.stringify({ company_id }) })
export const adminUnassignUser = (phone, company_id) =>
  req(`/api/admin/users/${phone}/unassign`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminH() }, body: JSON.stringify({ company_id }) })

export const adminStats = () => req('/api/admin/stats', { headers: adminH() })

// ---- admin: settings + layered profiles ----
export const adminGetSettings = () => req('/api/admin/settings', { headers: adminH() })
export const adminSaveIntro = (intro_message) =>
  req('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminH() }, body: JSON.stringify({ intro_message }) })
export const adminSaveSettings = (obj) =>
  req('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminH() }, body: JSON.stringify(obj) })
export const adminUploadDefaultProfile = (fd) =>
  req('/api/admin/default-profile', { method: 'POST', headers: adminH(), body: fd })
export const adminCategoryProfiles = () => req('/api/admin/category-profiles', { headers: adminH() })
export const adminSetCategoryProfile = (fd) =>
  req('/api/admin/category-profiles', { method: 'POST', headers: adminH(), body: fd })
export const adminDeleteCategoryProfile = (cat) =>
  req(`/api/admin/category-profiles/${encodeURIComponent(cat)}`, { method: 'DELETE', headers: adminH() })

// ---- admin: templates ----
export const adminTemplates = () => req('/api/admin/templates', { headers: adminH() })
export const adminCreateTemplate = (title, body) =>
  req('/api/admin/templates', { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminH() }, body: JSON.stringify({ title, body }) })
export const adminDeleteTemplate = (id) => req(`/api/admin/templates/${id}`, { method: 'DELETE', headers: adminH() })
