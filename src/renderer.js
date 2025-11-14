let originalLogContent = '';

document.getElementById('open-file').addEventListener('click', () => {
  window.electronAPI.openFileDialog()
})

window.electronAPI.onFileContent((content) => {
  originalLogContent = content;
  document.getElementById('log-content').textContent = content
})

document.getElementById('filter-button').addEventListener('click', () => {
  const filterQuery = document.getElementById('filter-input').value.toLowerCase();
  if (filterQuery) {
    const filteredContent = originalLogContent
      .split('\n')
      .filter(line => line.toLowerCase().includes(filterQuery))
      .join('\n');
    document.getElementById('log-content').textContent = filteredContent;
  } else {
    document.getElementById('log-content').textContent = originalLogContent;
  }
});
