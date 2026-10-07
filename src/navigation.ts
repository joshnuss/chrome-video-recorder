import type { Page } from 'playwright';

const sessionHint = 'The recorder uses a fresh Chrome session without your usual login cookies. The site may require authentication or reject automated browsers.';

export async function navigate(page: Page, source: string): Promise<void> {
  let response;
  try {
    response = await page.goto(source, { waitUntil: 'load' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('ERR_HTTP_RESPONSE_CODE_FAILURE')) {
      throw new Error(`Could not load ${source}: Chrome rejected the HTTP response. ${sessionHint}\n${error.message}`, { cause: error });
    }
    throw error;
  }
  if (response && response.status() >= 400) {
    throw new Error(`Could not load ${source}: HTTP ${response.status()} ${response.statusText()}. ${sessionHint}`);
  }
}
