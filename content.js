(() => {
  const BUTTON_CLASS = "mc110082-gmail-draft-button";
  const DRAFT_BUTTON_CLASS = "mc110082-gmail-secondary-draft-button";
  const PROCESSED_ATTR = "data-mc110082-gmail-button";
  const DEFAULT_EMAIL_BODY = "MC 110082";
  const DEFAULT_SUBJECT_TEMPLATE = "Truck for {from} to {to}";
  const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

  function getCurrentGmailAccountEmail() {
    if (location.hostname !== "mail.google.com") return "";

    const accountHints = [
      ...document.querySelectorAll(
        "[aria-label*='Google Account'], [aria-label*='Google account'], [data-tooltip*='Google Account'], [data-tooltip*='Google account'], [title*='Google Account'], [title*='Google account']"
      )
    ];

    for (const element of accountHints) {
      const text = [
        element.getAttribute("aria-label"),
        element.getAttribute("data-tooltip"),
        element.getAttribute("title"),
        element.textContent
      ].filter(Boolean).join(" ");
      const email = text.match(EMAIL_PATTERN)?.[0];
      if (email) return email.toLowerCase();
    }

    return "";
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "get-current-gmail-account") {
      sendResponse({ email: getCurrentGmailAccountEmail() });
    }
  });

  async function reportSelectedGmailAccount() {
    if (location.hostname !== "mail.google.com") return;

    const settings = await chrome.storage.sync.get({
      pendingGmailAccountSelection: false
    });
    if (!settings.pendingGmailAccountSelection) return;

    const email = getCurrentGmailAccountEmail();
    if (email) {
      chrome.runtime.sendMessage({ type: "gmail-account-detected", email });
    }
  }

  if (location.hostname === "mail.google.com") {
    reportSelectedGmailAccount();
    const gmailAccountDetectionTimer = setInterval(reportSelectedGmailAccount, 1500);
    setTimeout(() => clearInterval(gmailAccountDetectionTimer), 60000);
  }

  async function getSettings() {
    return chrome.storage.sync.get({
      selectedGmailEmail: "",
      subjectTemplate: DEFAULT_SUBJECT_TEMPLATE,
      emailBody: DEFAULT_EMAIL_BODY,
      useDrafts: true,
      setupComplete: false
    });
  }

  function openSettingsPage() {
    chrome.runtime.sendMessage({ type: "open-options-page" });
  }

  function cleanLocation(value) {
    return value
      .replace(/\s+/g, " ")
      .replace(/\s*\(\d+\)\s*/g, "")
      .replace(/\s+\d+\s*(mi|miles)\b.*$/i, "")
      .replace(/^[-•\s]+|[-•\s]+$/g, "")
      .trim();
  }

  function parseRouteFromText(text) {
    const normalized = text.replace(/\s+/g, " ").trim();
    const arrowMatch = normalized.match(
      /([A-Z][A-Za-z .'-]+,\s*[A-Z]{2})(?:\s*\(\d+\))?\s*(?:->|→|›|➜|⇢|to)\s*([A-Z][A-Za-z .'-]+,\s*[A-Z]{2})/i
    );

    if (arrowMatch) {
      return {
        from: cleanLocation(arrowMatch[1]),
        to: cleanLocation(arrowMatch[2])
      };
    }

    const locationMatches = [...normalized.matchAll(/\b([A-Z][A-Za-z .'-]+,\s*[A-Z]{2})\b/g)]
      .map((match) => cleanLocation(match[1]))
      .filter(Boolean);
    const uniqueLocations = [...new Set(locationMatches)];

    if (uniqueLocations.length >= 2) {
      return {
        from: uniqueLocations[0],
        to: uniqueLocations[1]
      };
    }

    return null;
  }

  function findRouteNearEmail(emailElement) {
    const containers = [
      document.querySelector("main"),
      emailElement.closest("section"),
      emailElement.closest("article"),
      emailElement.closest("[role='main']"),
      document.body
    ].filter(Boolean);

    for (const container of containers) {
      const route = parseRouteFromText(container.innerText || "");
      if (route) return route;
    }

    return null;
  }

  function renderTemplate(template, variables) {
    return (template || "").replace(/\{(from|to|email)\}/gi, (match, key) => {
      return variables[key.toLowerCase()] || match;
    });
  }

  function createRenderedEmail(email, route, settings) {
    const variables = {
      from: route.from,
      to: route.to,
      email
    };

    return {
      subject: renderTemplate(settings.subjectTemplate || DEFAULT_SUBJECT_TEMPLATE, variables),
      body: renderTemplate(settings.emailBody || DEFAULT_EMAIL_BODY, variables)
    };
  }

  function createGmailUrl(email, route, settings) {
    const renderedEmail = createRenderedEmail(email, route, settings);
    const params = new URLSearchParams({
      authuser: settings.selectedGmailEmail,
      view: "cm",
      fs: "1",
      to: email,
      su: renderedEmail.subject,
      body: renderedEmail.body
    });

    return `https://mail.google.com/mail/?${params.toString()}`;
  }

  function createEmailPayload(email, route, settings) {
    const renderedEmail = createRenderedEmail(email, route, settings);

    return {
      selectedGmailEmail: settings.selectedGmailEmail,
      to: email,
      subject: renderedEmail.subject,
      body: renderedEmail.body
    };
  }

  function getEmailFromElement(element) {
    const href = element.getAttribute("href") || "";
    const mailtoEmail = href.match(/^mailto:([^?]+)/i)?.[1];
    const textEmail = element.textContent.match(EMAIL_PATTERN)?.[0];
    return decodeURIComponent(mailtoEmail || textEmail || "").trim();
  }

  function addButtonToEmail(emailElement) {
    if (emailElement.getAttribute(PROCESSED_ATTR) === "true") return;

    const email = getEmailFromElement(emailElement);
    if (!email) return;

    const route = findRouteNearEmail(emailElement);
    if (!route?.from || !route?.to) return;

    emailElement.setAttribute(PROCESSED_ATTR, "true");

    const sendButton = document.createElement("button");
    sendButton.type = "button";
    sendButton.className = `${BUTTON_CLASS} mc110082-gmail-send-button`;
    sendButton.textContent = "Send email";
    sendButton.title = `Send email now: Truck for ${route.from} to ${route.to}`;
    sendButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const settings = await getSettings();

      if (!settings.setupComplete || !settings.selectedGmailEmail) {
        openSettingsPage();
        return;
      }

      sendButton.disabled = true;
      sendButton.textContent = "Sending...";

      const response = await chrome.runtime.sendMessage({
        type: "send-gmail-message",
        payload: createEmailPayload(email, route, settings)
      });

      if (response?.ok) {
        sendButton.textContent = "Sent";
        setTimeout(() => {
          sendButton.disabled = false;
          sendButton.textContent = "Send email";
        }, 2500);
        return;
      }

      sendButton.disabled = false;
      sendButton.textContent = "Send email";
      window.alert(response?.error || "Email failed to send.");
    });

    emailElement.insertAdjacentElement("afterend", sendButton);

    getSettings().then((settings) => {
      if (!settings.useDrafts) return;

      const draftButton = document.createElement("button");
      draftButton.type = "button";
      draftButton.className = `${BUTTON_CLASS} ${DRAFT_BUTTON_CLASS}`;
      draftButton.textContent = "Gmail draft";
      draftButton.title = `Create Gmail draft: Truck for ${route.from} to ${route.to}`;
      draftButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const latestSettings = await getSettings();

        if (!latestSettings.setupComplete || !latestSettings.selectedGmailEmail) {
          openSettingsPage();
          return;
        }

        window.open(createGmailUrl(email, route, latestSettings), "_blank", "noopener,noreferrer");
      });

      sendButton.insertAdjacentElement("afterend", draftButton);
    });
  }

  function findEmailElements() {
    const emailLinks = [...document.querySelectorAll("a[href^='mailto:'], a")]
      .filter((element) => getEmailFromElement(element));

    emailLinks.forEach(addButtonToEmail);
  }

  function rebuildEmailButtons() {
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => button.remove());
    document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach((element) => {
      element.removeAttribute(PROCESSED_ATTR);
    });
    findEmailElements();
  }

  const scheduleFindEmailElements = (() => {
    let frame = null;
    return () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        findEmailElements();
      });
    };
  })();

  findEmailElements();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && Object.prototype.hasOwnProperty.call(changes, "useDrafts")) {
      rebuildEmailButtons();
    }
  });

  const observer = new MutationObserver(scheduleFindEmailElements);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();
