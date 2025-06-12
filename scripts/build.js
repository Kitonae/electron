const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const platform = process.argv[2] || 'current';
const isProduction = process.env.NODE_ENV === 'production';

console.log(`Building WATCHOUT Assistant for ${platform}...`);

// Ensure dist directory exists
const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

try {
    // Install dependencies if needed
    console.log('Installing dependencies...');
    execSync('npm install', { stdio: 'inherit' });

    // Build based on platform
    let buildCommand;
    switch (platform) {
        case 'win':
        case 'windows':
            buildCommand = 'npm run build:win';
            break;
        case 'mac':
        case 'macos':
            buildCommand = 'npm run build:mac';
            break;
        case 'linux':
            buildCommand = 'npm run build:linux';
            break;
        case 'all':
            buildCommand = 'npm run build';
            break;
        default:
            buildCommand = 'npm run build';
    }

    console.log(`Executing: ${buildCommand}`);
    execSync(buildCommand, { stdio: 'inherit' });

    console.log('✅ Build completed successfully!');
    console.log(`📦 Output files are in: ${distDir}`);

} catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
}
