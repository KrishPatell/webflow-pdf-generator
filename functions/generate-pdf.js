const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

exports.handler = async (event, context) => {
  // Enable CORS for browser requests
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    // Check if target parameter is provided
    const { target } = event.queryStringParameters || {};
    
    if (!target) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Missing required parameter: target',
          message: 'Please provide a target URL in the query parameters',
          example: '/.netlify/functions/generate-pdf?target=https://example.com/blog-post'
        })
      };
    }

    // Validate URL format
    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch (error) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Invalid URL format',
          message: 'The target parameter must be a valid URL',
          provided: target
        })
      };
    }

    console.log(`Starting PDF generation for: ${targetUrl.href}`);

    // Launch browser with optimized settings for Netlify Functions
    const browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-hang-monitor',
        '--disable-prompt-on-repost',
        '--disable-client-side-phishing-detection',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-default-browser-check',
        '--mute-audio',
        '--no-pings',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ],
      defaultViewport: {
        width: 1200,
        height: 800,
        deviceScaleFactor: 1,
      },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
      timeout: 30000, // 30 second timeout for launch
    });

    const page = await browser.newPage();

    try {
      // Set user agent to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Enable request interception to optimize loading
      await page.setRequestInterception(true);
      
      const blockedResources = ['image', 'stylesheet', 'font', 'media'];
      page.on('request', (req) => {
        if (blockedResources.includes(req.resourceType())) {
          req.continue();
        } else {
          req.continue();
        }
      });

      console.log('Navigating to target page...');
      
      // Navigate to the target page with extended timeout
      await page.goto(targetUrl.href, {
        waitUntil: 'networkidle0',
        timeout: 60000, // 60 second timeout for navigation
      });

      console.log('Page loaded, waiting for content to stabilize...');

      // Wait for all images to load
      await page.evaluate(() => {
        return Promise.all(
          Array.from(document.images)
            .filter(img => !img.complete)
            .map(img => new Promise(resolve => {
              img.onload = img.onerror = resolve;
            }))
        );
      });

      // Wait for fonts to load
      await page.evaluate(() => {
        return document.fonts.ready;
      });

      // Wait for lazy-loaded content and dynamic elements
      await page.waitForTimeout(2000); // 2 second delay for late-loaded content

      // Wait for page height to stabilize (important for long blog posts)
      let previousHeight = 0;
      let stableCount = 0;
      const maxStableCount = 3; // Consider stable after 3 consecutive checks

      for (let i = 0; i < 10; i++) { // Max 10 attempts
        const currentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        
        if (currentHeight === previousHeight) {
          stableCount++;
          if (stableCount >= maxStableCount) {
            console.log(`Page height stabilized at ${currentHeight}px after ${i + 1} checks`);
            break;
          }
        } else {
          stableCount = 0;
          previousHeight = currentHeight;
        }

        // Scroll to bottom to trigger lazy loading
        await page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
        });

        await page.waitForTimeout(500); // Wait 500ms between checks
      }

      // Scroll back to top
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });

      // Wait a bit more for any final animations
      await page.waitForTimeout(1000);

      console.log('Generating PDF...');

      // Generate PDF with specified settings
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true, // Enable background graphics
        margin: {
          top: '10mm',
          right: '10mm',
          bottom: '10mm',
          left: '10mm'
        },
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        scale: 1.0,
        timeout: 60000 // 60 second timeout for PDF generation
      });

      console.log(`PDF generated successfully, size: ${pdfBuffer.length} bytes`);

      // Extract blog title for filename
      let filename = 'blog-post';
      try {
        const title = await page.title();
        if (title && title.trim()) {
          filename = title
            .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .toLowerCase()
            .substring(0, 50); // Limit length
        }
      } catch (error) {
        console.warn('Could not extract title for filename:', error.message);
      }

      // Clean up browser
      await browser.close();

      // Return PDF with proper headers
      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}.pdf"`,
          'Content-Length': pdfBuffer.length.toString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        body: pdfBuffer.toString('base64'),
        isBase64Encoded: true
      };

    } catch (pageError) {
      console.error('Error during page processing:', pageError);
      await browser.close();
      
      return {
        statusCode: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Failed to process page',
          message: 'The page could not be loaded or processed for PDF generation',
          details: pageError.message,
          target: targetUrl.href
        })
      };
    }

  } catch (error) {
    console.error('Function error:', error);
    
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'An unexpected error occurred while generating the PDF',
        details: error.message
      })
    };
  }
};
