// Select one browser for every legacy scenario without changing its assertions.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const launch = chromium.launch.bind(chromium);
const channel = process.env.VERIFY_BROWSER || 'chromium';
chromium.launch = (options = {}) => {
  const selected = { ...options };
  if (channel === 'chromium') delete selected.channel;
  else selected.channel = channel;
  return launch(selected);
};
