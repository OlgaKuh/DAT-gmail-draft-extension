const DEFAULT_EMAIL_BODY = "MC 110082";
const DEFAULT_SUBJECT_TEMPLATE = "Truck for {from} to {to}";

const form = document.querySelector("#settings-form");
const accountSelect = document.querySelector("#gmail-account-select");
const chooseGoogleAccountButton = document.querySelector("#choose-google-account");
const removeAccountButton = document.querySelector("#remove-account");
const redirectUriInput = document.querySelector("#gmail-send-redirect-uri");
const copyRedirectUriButton = document.querySelector("#copy-redirect-uri");
const authorizeSendButton = document.querySelector("#authorize-send");
const subjectTemplateInput = document.querySelector("#subject-template");
const bodyTextarea = document.querySelector("#email-body");
const statusElement = document.querySelector("#status");
const testLink = document.querySelector("#test-link");

let gmailAccounts = [];

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function updateTestLink() {
  const selectedEmail = accountSelect.value;
  const params = selectedEmail ? `?authuser=${encodeURIComponent(selectedEmail)}` : "";
  testLink.href = `https://mail.google.com/mail/${params}`;
}

function renderAccountOptions(selectedEmail = "") {
  accountSelect.innerHTML = '<option value="">Choose an account</option>';

  gmailAccounts.forEach((email) => {
    const option = document.createElement("option");
    option.value = email;
    option.textContent = email;
    accountSelect.append(option);
  });

  accountSelect.value = gmailAccounts.includes(selectedEmail) ? selectedEmail : "";
  removeAccountButton.disabled = !accountSelect.value;
  updateTestLink();
}

async function persistAccountList(selectedEmail = accountSelect.value) {
  await chrome.storage.sync.set({
    gmailAccounts,
    selectedGmailEmail: selectedEmail,
    setupComplete: Boolean(selectedEmail)
  });
}

async function authorizeSendAccess(email) {
  statusElement.textContent = email
    ? `Authorizing Gmail send access for ${email}...`
    : "Choose a Google account and authorize Gmail send access...";
  const response = await chrome.runtime.sendMessage({
    type: "authorize-gmail-send",
    email
  });

  if (!response?.ok) {
    statusElement.textContent = response?.error || "Gmail send authorization failed.";
    return false;
  }

  const authorizedEmail = normalizeEmail(response.result?.email || email || "");

  if (authorizedEmail) {
    if (!gmailAccounts.includes(authorizedEmail)) {
      gmailAccounts.push(authorizedEmail);
      gmailAccounts.sort();
    }
    renderAccountOptions(authorizedEmail);
    await persistAccountList(authorizedEmail);
  }

  statusElement.textContent = `Authorized Gmail send access for ${authorizedEmail}.`;
  return authorizedEmail;
}

async function removeSelectedAccount() {
  const selectedEmail = accountSelect.value;
  if (!selectedEmail) return;

  gmailAccounts = gmailAccounts.filter((email) => email !== selectedEmail);
  renderAccountOptions("");
  await persistAccountList("");
  statusElement.textContent = `Removed ${selectedEmail}.`;
}

async function chooseWithGoogleAccountChooser() {
  await authorizeSendAccess("");
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get({
    gmailAccounts: [],
    selectedGmailEmail: "",
    subjectTemplate: DEFAULT_SUBJECT_TEMPLATE,
    emailBody: DEFAULT_EMAIL_BODY
  });

  gmailAccounts = Array.isArray(settings.gmailAccounts)
    ? [...new Set(settings.gmailAccounts.map(normalizeEmail).filter(Boolean))].sort()
    : [];

  if (settings.selectedGmailEmail && !gmailAccounts.includes(settings.selectedGmailEmail)) {
    gmailAccounts.push(settings.selectedGmailEmail);
    gmailAccounts.sort();
  }

  renderAccountOptions(settings.selectedGmailEmail);
  subjectTemplateInput.value = settings.subjectTemplate || DEFAULT_SUBJECT_TEMPLATE;
  bodyTextarea.value = settings.emailBody || DEFAULT_EMAIL_BODY;

  const response = await chrome.runtime.sendMessage({ type: "get-gmail-send-redirect-uri" });
  redirectUriInput.value = response?.redirectUri || "";
}

async function saveSettings(event) {
  event.preventDefault();

  const selectedGmailEmail = accountSelect.value;

  if (!selectedGmailEmail) {
    statusElement.textContent = "Choose a Gmail account before saving.";
    return;
  }

  await chrome.storage.sync.set({
    gmailAccounts,
    selectedGmailEmail,
    subjectTemplate: subjectTemplateInput.value || DEFAULT_SUBJECT_TEMPLATE,
    emailBody: bodyTextarea.value || DEFAULT_EMAIL_BODY,
    setupComplete: true
  });

  statusElement.textContent = "Settings saved.";
}

accountSelect.addEventListener("change", () => {
  removeAccountButton.disabled = !accountSelect.value;
  updateTestLink();
});
chooseGoogleAccountButton.addEventListener("click", chooseWithGoogleAccountChooser);
removeAccountButton.addEventListener("click", removeSelectedAccount);
copyRedirectUriButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(redirectUriInput.value);
  statusElement.textContent = "Redirect URI copied.";
});
authorizeSendButton.addEventListener("click", async () => {
  const selectedEmail = accountSelect.value;

  await authorizeSendAccess(selectedEmail);
});
form.addEventListener("submit", saveSettings);
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;

  const accountListChanged = Boolean(changes.gmailAccounts);
  const selectedAccountChanged = Boolean(changes.selectedGmailEmail);

  if (!accountListChanged && !selectedAccountChanged) return;

  gmailAccounts = Array.isArray(changes.gmailAccounts?.newValue)
    ? [...new Set(changes.gmailAccounts.newValue.map(normalizeEmail).filter(Boolean))].sort()
    : gmailAccounts;

  const selectedEmail = changes.selectedGmailEmail?.newValue || accountSelect.value;
  renderAccountOptions(selectedEmail);

  if (selectedAccountChanged && selectedEmail) {
    statusElement.textContent = `Selected ${selectedEmail}.`;
  }
});
loadSettings();
