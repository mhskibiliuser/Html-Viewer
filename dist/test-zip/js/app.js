console.log('✅ js/app.js loaded successfully!');

function testFunction() {
    var output = document.getElementById('output');
    var message = '🎉 JavaScript is working! This file was loaded from js/app.js using relative paths.';
    output.textContent = message;
    console.log(message);
}

// Test that CSS loaded
console.log('Testing CSS...');
var testElement = document.querySelector('body');
if (testElement) {
    var bgColor = window.getComputedStyle(testElement).backgroundColor;
    console.log('✅ CSS is applied. Body background:', bgColor);
}

// Log all images
console.log('Images on page:');
document.querySelectorAll('img').forEach(function(img) {
    console.log('  - ' + (img.src || img.getAttribute('src')));
});
