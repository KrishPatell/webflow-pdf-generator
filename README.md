# Netlify PDF Generation Function

This project contains a Netlify serverless function that generates PDFs from blog posts using Puppeteer Core and @sparticuz/chromium.

## Features

- ✅ Generates high-quality PDFs from any web page
- ✅ Optimized for Netlify Functions with @sparticuz/chromium
- ✅ Handles long blog posts with dynamic content
- ✅ Waits for all images, fonts, and lazy-loaded content
- ✅ A4 format with 10mm margins
- ✅ Background graphics enabled
- ✅ Automatic filename based on page title
- ✅ Robust error handling
- ✅ CORS enabled for browser requests

## Installation

```bash
npm install
```

## Dependencies

- `puppeteer-core`: Lightweight Puppeteer without bundled Chromium
- `@sparticuz/chromium`: Chromium binary optimized for AWS Lambda/Netlify

## Local Testing

1. Install Netlify CLI globally:
```bash
npm install -g netlify-cli
```

2. Start the local development server:
```bash
netlify dev
```

3. Test the function by visiting:
```
http://localhost:8888/.netlify/functions/generate-pdf?target=https://tiger-loans.webflow.io/post/refinancing-a-rental-property?loid=1848572
```

## Function Endpoint

**URL:** `/.netlify/functions/generate-pdf`

**Method:** GET

**Query Parameters:**
- `target` (required): The full URL of the blog post to convert to PDF

**Example:**
```
/.netlify/functions/generate-pdf?target=https://example.com/blog-post
```

## Response

**Success (200):**
- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="blog-title.pdf"`
- Body: Base64-encoded PDF data

**Error (400/500):**
- Content-Type: `application/json`
- Body: JSON error object with details

## How It Works

1. **Validation**: Checks for required `target` parameter and validates URL format
2. **Browser Launch**: Launches headless Chrome with optimized settings for serverless
3. **Page Loading**: Navigates to target URL and waits for network idle
4. **Content Stabilization**: 
   - Waits for all images to load
   - Waits for fonts to load
   - Waits for lazy-loaded content
   - Monitors page height until stable
5. **PDF Generation**: Creates PDF with specified A4 format and margins
6. **Response**: Returns PDF as downloadable attachment

## Configuration

The function is configured in `netlify.toml` with:
- **Timeout**: 300 seconds (5 minutes)
- **Memory**: 3008 MB (3 GB)
- **Included Files**: Chromium binary files

## Deployment

1. Push to your Git repository
2. Connect to Netlify
3. Deploy automatically or manually

## Troubleshooting

**Common Issues:**

1. **Function timeout**: Increase timeout in `netlify.toml`
2. **Memory issues**: Increase memory allocation
3. **PDF generation fails**: Check target URL accessibility
4. **Content not loading**: Function waits for network idle and content stabilization

**Logs:**
Check Netlify function logs for detailed error information.

## Performance Notes

- **Cold Start**: ~5-10 seconds for first request
- **Warm Start**: ~2-5 seconds for subsequent requests
- **PDF Generation**: Varies based on page complexity and length
- **Memory Usage**: Optimized for serverless environment

## Browser Compatibility

The function uses Chromium with specific flags optimized for:
- Serverless environments
- Low memory usage
- Fast startup times
- PDF generation quality
