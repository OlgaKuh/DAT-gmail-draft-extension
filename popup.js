const openSettingsButton = document.querySelector("#open-settings");
const useDraftsToggle = document.querySelector("#use-drafts");
const statusElement = document.querySelector("#status");

async function loadPopupSettings() {
  const settings = await chrome.storage.sync.get({
    useDrafts: true
  });

  useDraftsToggle.checked = settings.useDrafts;
}

openSettingsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

useDraftsToggle.addEventListener("change", async () => {
  await chrome.storage.sync.set({
    useDrafts: useDraftsToggle.checked
  });

  statusElement.textContent = useDraftsToggle.checked ? "Draft button enabled." : "Draft button hidden.";
});

loadPopupSettings();
