const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    // Get target URL from query params or body
    let target;
    if (event.httpMethod === 'GET') {
      target = event.queryStringParameters?.target;
    } else if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      target = body.target;
    }

    if (!target) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Missing target URL',
          message: 'Please provide a target URL parameter',
          example: '?target=https://example.com/blog-post'
        })
      };
    }

    // Validate URL
    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch (error) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Invalid URL format',
          message: 'The target must be a valid URL',
          provided: target
        })
      };
    }

    console.log(`Starting PDF generation for: ${targetUrl.href}`);

    // Try to launch browser with fallback options
    let browser;
    try {
      // First attempt: Use @sparticuz/chromium
      browser = await puppeteer.launch({
        args: [
          ...chromium.args,
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--disable-extensions',
          '--single-process',
          '--no-zygote'
        ],
        defaultViewport: {
          width: 1200,
          height: 800,
          deviceScaleFactor: 1,
        },
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
        timeout: 30000,
      });
      console.log('Browser launched with @sparticuz/chromium');
    } catch (chromiumError) {
      console.log('Chromium launch failed, trying system Chrome...');
      
      // Fallback: Try to use system Chrome
      try {
        browser = await puppeteer.launch({
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--disable-extensions'
          ],
          defaultViewport: {
            width: 1200,
            height: 800,
            deviceScaleFactor: 1,
          },
          headless: true,
          ignoreHTTPSErrors: true,
          timeout: 30000,
        });
        console.log('Browser launched with system Chrome');
      } catch (systemError) {
        console.error('Both Chromium and system Chrome failed:', systemError.message);
        
        return {
          statusCode: 500,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Browser launch failed',
            message: 'Could not launch browser for PDF generation',
            details: 'This might be due to missing Chrome installation or permissions',
            chromiumError: chromiumError.message,
            systemError: systemError.message,
            suggestion: 'Try deploying to Netlify where the environment is optimized for serverless functions'
          })
        };
      }
    }

    const page = await browser.newPage();

    try {
      // Set a realistic user agent
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Block unnecessary resources to speed up loading
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          req.continue();
        } else if (resourceType === 'script' && !req.url().includes('webflow')) {
          // Allow Webflow scripts, block others
          req.continue();
        } else {
          req.continue();
        }
      });

      console.log('Navigating to page...');
      
      // Navigate with extended timeout for Webflow sites
      await page.goto(targetUrl.href, {
        waitUntil: 'networkidle2', // Less strict than networkidle0
        timeout: 90000, // 90 seconds for Webflow
      });

      console.log('Page loaded, waiting for content...');

      // Wait for Webflow-specific elements
      try {
        await page.waitForSelector('[data-wf-site]', { timeout: 10000 });
        console.log('Webflow site detected');
      } catch (e) {
        console.log('Not a Webflow site or no site ID found');
      }

      // Wait for images to load
      await page.evaluate(() => {
        return Promise.all(
          Array.from(document.images)
            .filter(img => !img.complete)
            .map(img => new Promise(resolve => {
              img.onload = img.onerror = resolve;
            }))
        );
      });

      // Wait for fonts
      await page.evaluate(() => {
        if (document.fonts && document.fonts.ready) {
          return document.fonts.ready;
        }
        return Promise.resolve();
      });

      // Wait for dynamic content (important for Webflow)
      await page.waitForTimeout(3000);

      // Check if page has content
      const contentLength = await page.evaluate(() => {
        return document.body.textContent.length;
      });

      if (contentLength < 100) {
        throw new Error('Page appears to be empty or blocked');
      }

      console.log('Generating PDF...');

      // Generate PDF with Webflow-optimized settings
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '10mm',
          right: '10mm',
          bottom: '10mm',
          left: '10mm'
        },
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        scale: 1.0,
        timeout: 60000
      });

      console.log(`PDF generated: ${pdfBuffer.length} bytes`);

      // Extract title for filename
      let filename = 'webflow-blog-post';
      try {
        const title = await page.title();
        if (title && title.trim()) {
          filename = title
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .toLowerCase()
            .substring(0, 50);
        }
      } catch (error) {
        console.warn('Could not extract title:', error.message);
      }

      await browser.close();

      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}.pdf"`,
          'Content-Length': pdfBuffer.length.toString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
        body: pdfBuffer.toString('base64'),
        isBase64Encoded: true
      };

    } catch (pageError) {
      console.error('Page processing error:', pageError);
      await browser.close();
      
      return {
        statusCode: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Failed to process page',
          message: 'The page could not be loaded or processed',
          details: pageError.message,
          target: targetUrl.href,
          suggestion: 'This might be due to CORS restrictions or the page being blocked'
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
        message: 'An unexpected error occurred',
        details: error.message
      })
    };
  }
};
