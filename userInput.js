// userInput.js

document.addEventListener('DOMContentLoaded', () => {
    const socket = io('http://localhost:3001');
    
    const codeMirror = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
        mode: 'text/x-c++src', // Default to C++
        theme: 'default',
        lineNumbers: true
    });

    // Handle language change
    document.querySelectorAll('input[name="language"]').forEach((elem) => {
        elem.addEventListener('change', (event) => {
            const mode = event.target.value === 'cpp' ? 'text/x-c++src' : 'text/x-csrc';
            codeMirror.setOption('mode', mode);
        });
    });

    // Handle the 'Run Code' button click
    document.getElementById('run-code').addEventListener('click', () => {
        const code = codeMirror.getValue();
        const language = document.querySelector('input[name="language"]:checked').value;

        if (!code) {
            alert('Please enter some code to run.');
            return;
        }

        socket.emit('code', { code, language });
    });

    // Handle server responses
    socket.on('visualize', (data) => {
        visualizeCodeLogic(data);
    });

    socket.on('output', (output) => {
        document.getElementById('output-terminal').textContent = output;
    });
});

const visualizeCodeLogic = (code) => {
    if (typeof code !== 'string') {
        console.error('Expected code to be a string');
        return;
    }

    const svg = d3.select("#visualization").attr("width", "100%").attr("height", "100%");
    svg.selectAll("*").remove(); // Clear previous visualization

    const forLoopMatches = code.match(/for\s*\(([^)]+)\)/g);
    const ifStatementMatches = code.match(/if\s*\(([^)]+)\)/g);

    if (forLoopMatches) {
        svg.append("circle").attr("cx", 100).attr("cy", 200).attr("r", 50).style("fill", "blue");
    }

    if (ifStatementMatches) {
        svg.append("rect").attr("x", 200).attr("y", 150).attr("width", 100).attr("height", 100).style("fill", "green");
    }
};
