const WatchoutCommands = require('./src/watchout-commands.js');
const fs = require('fs');

async function testUploadWithShowName() {
    try {
        console.log('Testing upload show functionality with showName parameter...');
        
        const commands = new WatchoutCommands();
        
        // Get the current show data first
        const getResult = await commands.getCurrentShow('192.168.0.227');
        console.log('GET result success:', getResult.success);
        
        if (getResult.success && getResult.data) {
            console.log('Got show data successfully');
            
            // Test upload with a specific show name
            const testShowName = 'test_with_showname.watch';
            console.log(`\\nTesting upload with showName parameter: "${testShowName}"`);
            
            const uploadResult = await commands.uploadJsonShow('192.168.0.227', getResult.data, testShowName);
            console.log('Upload result:', uploadResult);
            
            // Wait a moment and then get the show again to see if the name changed
            console.log('\\nChecking if show name was updated...');
            setTimeout(async () => {
                const checkResult = await commands.getCurrentShow('192.168.0.227');
                if (checkResult.success && checkResult.data) {
                    console.log('New showName on server:', checkResult.data.showName);
                } else {
                    console.log('Failed to get updated show data');
                }
            }, 1000);
            
        } else {
            console.error('Failed to get show data:', getResult);
        }
        
    } catch (error) {
        console.error('Test failed:', error.message);
        console.error('Full error:', error);
    }
}

testUploadWithShowName();
