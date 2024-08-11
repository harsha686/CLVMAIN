const socket = io('http://localhost:3001');

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.36.1/min/vs' }});

require(['vs/editor/editor.main'], function() {
    let language = 'c';
    const editor = monaco.editor.create(document.getElementById('monacoEditor'), {
        value: '#include <stdio.h>\n\nint main() {\n\tprintf("Hello, World!\\n");\n\treturn 0;\n}',
        language: 'c',
        theme: 'vs-dark',
        automaticLayout: true
    });

    const output_terminal = monaco.editor.create(document.getElementById('output-terminal'), {
        value: 'Your Output appears here ..!',
        language: 'text',
        theme: 'vs-dark',
        automaticLayout: true,
        readOnly: true
    });
    document.getElementById('language-select').addEventListener('change', function() {
        language = this.value;
        let newValue = '';

        if (language === 'c') {
            newValue = '#include <stdio.h>\n\nint main() {\n\tprintf("Hello, World!\\n");\n\treturn 0;\n}';
            monaco.editor.setModelLanguage(editor.getModel(), 'c');
        } else if (language === 'cpp') {
            newValue = '#include <iostream>\n\nint main() {\n\tstd::cout << "Hello, World!" << std::endl;\n\treturn 0;\n}';
            monaco.editor.setModelLanguage(editor.getModel(), 'cpp');
        }

        editor.setValue(newValue);
    });

    document.getElementById('run-code').addEventListener('click', () => {
        const code = editor.getValue();
        const language =  document.getElementById('language-select').value; 
        if (!code) {
            alert('Please enter some code to run.');
            return;
        }
        socket.emit('code', { code, language });
    });


    socket.on('output', (output) => {
        output_terminal.setValue(output);
        console.log(output);
    });

    socket.on('video', (videoFileName) => {
        const videoElement = document.getElementById('generated-video');
        const videoUrl = `/videos/${videoFileName}`;
    
        videoElement.src = videoUrl;    

        /* const downloadButton = document.getElementById('download-video');
        downloadButton.href = videoUrl;
        downloadButton.download = videoUrl; */
    });
});
    