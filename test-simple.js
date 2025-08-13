const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

async function testFunction() {
    console.log('Testing PDF generation function...');
    
    try {
        // Test browser launch
        console.log('Launching browser...');
        const browser = await puppeteer.launch({
            args: chromium.args,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });
        
        console.log('Browser launched successfully!');
        
        const page = await browser.newPage();
        console.log('New page created');
        
        // Test basic navigation
        console.log('Testing page navigation...');
        await page.goto('https://example.com', { timeout: 10000 });
        
        const title = await page.title();
        console.log(`Page title: ${title}`);
        
        await browser.close();
        console.log('✅ All tests passed! Function should work correctly.');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

testFunction();
