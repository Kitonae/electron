const WatchoutCommands = require('./src/watchout-commands.js');

async function testShowNameInData() {
    console.log('Testing showName modification in JSON data...');
    
    try {
        const commands = new WatchoutCommands();
        
        // Step 1: Get current show data
        console.log('\n1. Getting current show from server...');
        const getResult = await commands.getCurrentShow('192.168.0.208');
        
        if (!getResult.success || !getResult.data) {
            console.error('Failed to get show data:', getResult);
            return;
        }
        
        console.log('✓ Original showName in data:', getResult.data.showName);
        
        // Step 2: Modify the showName in the data itself
        const modifiedData = { ...getResult.data };
        modifiedData.showName = 'test-modified-in-data.watch';
        
        console.log('\n2. Modified showName in data to:', modifiedData.showName);
        console.log('Uploading with both URL parameter and modified data...');
        
        const uploadResult = await commands.uploadJsonShow('192.168.0.208', modifiedData, 'test-url-param.watch');
        console.log('Upload result:', uploadResult);
        
        // Step 3: Check what's on the server now
        console.log('\n3. Checking server after upload...');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        
        const verifyResult = await commands.getCurrentShow('192.168.0.208');
        
        if (verifyResult.success && verifyResult.data) {
            console.log('Server showName after upload:', verifyResult.data.showName);
            console.log('Expected from URL param: test-url-param.watch');
            console.log('Expected from data: test-modified-in-data.watch');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testShowNameInData();
