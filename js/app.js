document.addEventListener('DOMContentLoaded', () => {
    // ========================================
    //  Configuration & State
    // ========================================
    const HISTORY_KEY = 'perpustakaan_api_history';
    let booksData = [];
    let totalRequests = 0;
    let responseTimes = [];
    let lastStatus = '—';
    let editingBookId = null;
    let deletingBookId = null;

    // ========================================
    //  DOM Elements
    // ========================================
    const serverIpInput = document.getElementById('server-ip');
    const serverPathInput = document.getElementById('server-path');
    const btnTestConnection = document.getElementById('btn-test-connection');
    const connectionStatus = document.getElementById('connection-status');

    const methodSelect = document.getElementById('method');
    const urlInput = document.getElementById('url');
    const bodyGroup = document.getElementById('body-group');
    const requestBody = document.getElementById('request-body');
    const apiForm = document.getElementById('api-form');
    const btnSend = document.getElementById('btn-send');

    const responseStatus = document.getElementById('response-status');
    const responseTime = document.getElementById('response-time');
    const responseJson = document.getElementById('response-json');
    const btnClearResponse = document.getElementById('btn-clear-response');

    const sidebarHistory = document.getElementById('sidebar-history');
    const btnClearHistory = document.getElementById('btn-clear-history');

    const booksGrid = document.getElementById('books-grid');
    const booksEmpty = document.getElementById('books-empty');
    const searchBooks = document.getElementById('search-books');
    const btnAddBook = document.getElementById('btn-add-book');
    const btnRefreshBooks = document.getElementById('btn-refresh-books');

    const hamburger = document.getElementById('hamburger');
    const sidebar = document.getElementById('sidebar');

    // Stats
    const statTotal = document.getElementById('stat-total');
    const statRequests = document.getElementById('stat-requests');
    const statAvgTime = document.getElementById('stat-avg-time');
    const statLastStatus = document.getElementById('stat-last-status');

    // Modals
    const modalAdd = document.getElementById('modal-add');
    const modalEdit = document.getElementById('modal-edit');
    const modalDelete = document.getElementById('modal-delete');

    // ========================================
    //  Helpers
    // ========================================
    function getApiUrl(path = '') {
        const ip = serverIpInput.value.trim();
        const basePath = serverPathInput.value.trim();
        return `http://${ip}${basePath}${path}`;
    }

    function updateUrlBar() {
        const method = methodSelect.value;
        if (method === 'PUT') {
            urlInput.value = getApiUrl('?id={ID}');
        } else if (method === 'DELETE') {
            urlInput.value = getApiUrl('?id={ID}');
        } else {
            urlInput.value = getApiUrl();
        }
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ========================================
    //  Toast Notifications
    // ========================================
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // ========================================
    //  View Navigation
    // ========================================
    const navItems = document.querySelectorAll('.nav-item[data-view]');
    const views = document.querySelectorAll('.view');
    const topbarTitle = document.getElementById('topbar-title');

    const viewTitles = {
        dashboard: 'Dashboard',
        books: 'Koleksi Buku',
        api: 'API Console'
    };

    function switchView(viewName) {
        views.forEach(v => v.classList.remove('active'));
        navItems.forEach(n => n.classList.remove('active'));

        const target = document.getElementById(`view-${viewName}`);
        if (target) target.classList.add('active');

        navItems.forEach(n => {
            if (n.getAttribute('data-view') === viewName) n.classList.add('active');
        });

        topbarTitle.textContent = viewTitles[viewName] || viewName;

        // Close sidebar on mobile
        sidebar.classList.remove('open');
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(item.getAttribute('data-view'));
        });
    });

    hamburger.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    // ========================================
    //  Method / URL Sync
    // ========================================
    methodSelect.addEventListener('change', () => {
        const method = methodSelect.value;
        bodyGroup.style.display = (method === 'POST' || method === 'PUT') ? 'block' : 'none';

        if (method === 'POST') {
            requestBody.value = '{\n  "judul": "",\n  "penulis": "",\n  "tahun_terbit": 2025\n}';
        } else if (method === 'PUT') {
            requestBody.value = '{\n  "judul": ""\n}';
        }

        updateUrlBar();
        updateMethodColors();
    });

    function updateMethodColors() {
        const m = methodSelect.value;
        const colors = { GET: '#4f8cff', POST: '#34d399', PUT: '#fbbf24', DELETE: '#f87171' };
        methodSelect.style.color = colors[m] || '#4f8cff';
    }

    serverIpInput.addEventListener('input', updateUrlBar);
    serverPathInput.addEventListener('input', updateUrlBar);

    // ========================================
    //  Connection Test
    // ========================================
    btnTestConnection.addEventListener('click', async () => {
        btnTestConnection.innerHTML = '<span class="spinner"></span>';
        try {
            const response = await fetch(getApiUrl(), { method: 'GET' });
            if (response.ok) {
                setConnectionStatus(true);
                showToast('Koneksi ke server berhasil!', 'success');
                const data = await response.json();
                if (data.data) {
                    booksData = data.data;
                    updateStats();
                    renderBooks();
                }
            } else {
                setConnectionStatus(false);
                showToast('Server merespon dengan error.', 'error');
            }
        } catch (e) {
            setConnectionStatus(false);
            showToast('Tidak dapat terhubung ke server. Periksa IP dan koneksi.', 'error');
        }
        btnTestConnection.textContent = 'Test';
    });

    function setConnectionStatus(online) {
        const dot = connectionStatus.querySelector('.status-dot');
        const text = connectionStatus.querySelector('span:last-child');
        if (online) {
            dot.className = 'status-dot online';
            text.textContent = 'Terhubung';
        } else {
            dot.className = 'status-dot offline';
            text.textContent = 'Tidak terhubung';
        }
    }

    // ========================================
    //  Core API Request
    // ========================================
    async function sendApiRequest(method, url, body = null) {
        const startTime = performance.now();
        
        try {
            const options = {
                method: method,
                headers: { 'Accept': 'application/json' }
            };

            if (body) {
                options.headers['Content-Type'] = 'application/json';
                options.body = JSON.stringify(body);
            }

            const response = await fetch(url, options);
            const endTime = performance.now();
            const timeDiff = Math.round(endTime - startTime);

            let responseData;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.indexOf('application/json') !== -1) {
                responseData = await response.json();
            } else {
                responseData = await response.text();
            }

            // Track stats
            totalRequests++;
            responseTimes.push(timeDiff);
            lastStatus = `${response.status}`;

            setConnectionStatus(response.ok);

            return {
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                time: timeDiff,
                data: responseData
            };

        } catch (error) {
            const endTime = performance.now();
            const timeDiff = Math.round(endTime - startTime);
            totalRequests++;
            lastStatus = 'Error';
            setConnectionStatus(false);

            return {
                ok: false,
                status: 0,
                statusText: 'Network Error',
                time: timeDiff,
                data: null,
                error: error.message
            };
        }
    }

    // ========================================
    //  API Console Form
    // ========================================
    apiForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const method = methodSelect.value;
        const url = urlInput.value.trim();
        let bodyData = null;

        if (!url || url.includes('{ID}')) {
            showToast('URL belum lengkap. Ganti {ID} dengan nomor ID buku yang benar.', 'error');
            return;
        }

        if (method === 'POST' || method === 'PUT') {
            const bodyStr = requestBody.value.trim();
            if (bodyStr) {
                try {
                    bodyData = JSON.parse(bodyStr);
                } catch (err) {
                    showToast('Format JSON tidak valid.', 'error');
                    return;
                }
            }
        }

        btnSend.innerHTML = '<span class="spinner"></span> Mengirim...';
        btnSend.disabled = true;

        const result = await sendApiRequest(method, url, bodyData);

        // Update response display
        const statusDot = responseStatus.querySelector('.meta-dot');

        if (result.error) {
            responseStatus.innerHTML = `<span class="meta-dot error"></span> Network Error`;
            responseTime.textContent = `${result.time} ms`;
            responseJson.textContent = `Tidak dapat terhubung ke server.\nPeriksa IP Device A dan koneksi jaringan.\n\nError: ${result.error}`;
            showToast('Gagal terhubung ke server.', 'error');
        } else {
            const isOk = result.ok;
            responseStatus.innerHTML = `<span class="meta-dot ${isOk ? 'success' : 'error'}"></span> ${result.status} ${result.statusText}`;
            responseTime.textContent = `${result.time} ms`;
            responseJson.textContent = JSON.stringify(result.data, null, 2);

            if (isOk) {
                showToast(`${method} berhasil — ${result.status}`, 'success');
            } else {
                showToast(`${method} gagal — ${result.status}`, 'error');
            }

            // Update books if GET
            if (method === 'GET' && isOk && result.data && result.data.data) {
                booksData = result.data.data;
                renderBooks();
            }
        }

        // Save to history
        saveHistory(method, url, method === 'POST' || method === 'PUT' ? requestBody.value : '');
        updateStats();

        btnSend.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> SEND`;
        btnSend.disabled = false;
    });

    btnClearResponse.addEventListener('click', () => {
        responseStatus.innerHTML = '<span class="meta-dot"></span> Menunggu...';
        responseTime.textContent = '— ms';
        responseJson.textContent = '// Response akan muncul di sini setelah request dikirim.';
    });

    // ========================================
    //  Quick Actions (Dashboard)
    // ========================================
    document.getElementById('quick-get').addEventListener('click', async () => {
        switchView('api');
        methodSelect.value = 'GET';
        methodSelect.dispatchEvent(new Event('change'));
        apiForm.dispatchEvent(new Event('submit'));
    });

    document.getElementById('quick-post').addEventListener('click', () => {
        openModal('modal-add');
    });

    document.getElementById('quick-put').addEventListener('click', () => {
        const id = prompt('Masukkan ID buku yang ingin diedit:');
        if (id && !isNaN(id)) {
            const book = booksData.find(b => b.id === parseInt(id));
            if (book) {
                openEditModal(book);
            } else {
                showToast(`Buku dengan ID ${id} tidak ditemukan di data lokal. Coba lakukan GET terlebih dahulu.`, 'error');
            }
        }
    });

    document.getElementById('quick-delete').addEventListener('click', () => {
        const id = prompt('Masukkan ID buku yang ingin dihapus:');
        if (id && !isNaN(id)) {
            openDeleteModal(parseInt(id));
        }
    });

    // ========================================
    //  Books Rendering
    // ========================================
    function renderBooks(filter = '') {
        // Remove existing book cards (but keep empty state)
        const existingCards = booksGrid.querySelectorAll('.book-card');
        existingCards.forEach(c => c.remove());

        let filtered = booksData;
        if (filter) {
            const lowerFilter = filter.toLowerCase();
            filtered = booksData.filter(b =>
                b.judul.toLowerCase().includes(lowerFilter) ||
                b.penulis.toLowerCase().includes(lowerFilter)
            );
        }

        if (filtered.length === 0) {
            booksEmpty.style.display = 'block';
            return;
        }

        booksEmpty.style.display = 'none';

        filtered.forEach((book, index) => {
            const card = document.createElement('div');
            card.className = 'book-card';
            card.style.animationDelay = `${index * 0.05}s`;

            card.innerHTML = `
                <span class="book-id">ID #${escapeHtml(book.id)}</span>
                <div class="book-title">${escapeHtml(book.judul)}</div>
                <div class="book-author">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    ${escapeHtml(book.penulis)}
                </div>
                <div class="book-year">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    ${escapeHtml(book.tahun_terbit)}
                </div>
                <div class="book-actions">
                    <button class="btn-edit" data-id="${book.id}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        Edit
                    </button>
                    <button class="btn-delete" data-id="${book.id}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        Hapus
                    </button>
                </div>
            `;

            // Event listeners for edit/delete
            card.querySelector('.btn-edit').addEventListener('click', () => {
                openEditModal(book);
            });

            card.querySelector('.btn-delete').addEventListener('click', () => {
                openDeleteModal(book.id, book.judul);
            });

            booksGrid.appendChild(card);
        });
    }

    searchBooks.addEventListener('input', () => {
        renderBooks(searchBooks.value);
    });

    btnRefreshBooks.addEventListener('click', async () => {
        btnRefreshBooks.disabled = true;
        const result = await sendApiRequest('GET', getApiUrl());
        if (result.ok && result.data && result.data.data) {
            booksData = result.data.data;
            renderBooks();
            updateStats();
            showToast(`${booksData.length} buku berhasil dimuat.`, 'success');
            saveHistory('GET', getApiUrl(), '');
        } else {
            showToast('Gagal memuat data buku.', 'error');
        }
        btnRefreshBooks.disabled = false;
    });

    // ========================================
    //  Modals
    // ========================================
    function openModal(id) {
        document.getElementById(id).classList.add('show');
    }

    function closeModal(id) {
        document.getElementById(id).classList.remove('show');
    }

    // Close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal(btn.getAttribute('data-close'));
        });
    });

    // Click outside to close
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('show');
            }
        });
    });

    // Add Book modal
    btnAddBook.addEventListener('click', () => openModal('modal-add'));

    document.getElementById('btn-submit-add').addEventListener('click', async () => {
        const judul = document.getElementById('input-judul').value.trim();
        const penulis = document.getElementById('input-penulis').value.trim();
        const tahun = document.getElementById('input-tahun').value.trim();

        if (!judul || !penulis || !tahun) {
            showToast('Semua field wajib diisi.', 'error');
            return;
        }

        const body = { judul, penulis, tahun_terbit: parseInt(tahun) };
        const result = await sendApiRequest('POST', getApiUrl(), body);

        if (result.ok) {
            showToast(`Buku "${judul}" berhasil ditambahkan!`, 'success');
            closeModal('modal-add');
            document.getElementById('input-judul').value = '';
            document.getElementById('input-penulis').value = '';
            document.getElementById('input-tahun').value = '';

            // Refresh list
            const getResult = await sendApiRequest('GET', getApiUrl());
            if (getResult.ok && getResult.data && getResult.data.data) {
                booksData = getResult.data.data;
                renderBooks();
            }
            saveHistory('POST', getApiUrl(), JSON.stringify(body, null, 2));
            updateStats();
        } else {
            showToast(result.data?.message || 'Gagal menambahkan buku.', 'error');
        }
    });

    // Edit Book modal
    function openEditModal(book) {
        editingBookId = book.id;
        document.getElementById('edit-info').textContent = `Mengedit: ${book.judul} (ID: ${book.id})`;
        document.getElementById('input-edit-judul').value = book.judul;
        openModal('modal-edit');
    }

    document.getElementById('btn-submit-edit').addEventListener('click', async () => {
        const judul = document.getElementById('input-edit-judul').value.trim();
        if (!judul) {
            showToast('Judul buku wajib diisi.', 'error');
            return;
        }

        const url = getApiUrl(`?id=${editingBookId}`);
        const body = { judul };
        const result = await sendApiRequest('PUT', url, body);

        if (result.ok) {
            showToast(`Judul buku ID #${editingBookId} berhasil diubah!`, 'success');
            closeModal('modal-edit');

            const getResult = await sendApiRequest('GET', getApiUrl());
            if (getResult.ok && getResult.data && getResult.data.data) {
                booksData = getResult.data.data;
                renderBooks();
            }
            saveHistory('PUT', url, JSON.stringify(body, null, 2));
            updateStats();
        } else {
            showToast(result.data?.message || 'Gagal mengubah judul buku.', 'error');
        }
    });

    // Delete Book modal
    function openDeleteModal(id, title) {
        deletingBookId = id;
        document.getElementById('delete-info').textContent = title
            ? `Apakah kamu yakin ingin menghapus "${title}" (ID: ${id})?`
            : `Apakah kamu yakin ingin menghapus buku ID: ${id}?`;
        openModal('modal-delete');
    }

    document.getElementById('btn-submit-delete').addEventListener('click', async () => {
        const url = getApiUrl(`?id=${deletingBookId}`);
        const result = await sendApiRequest('DELETE', url);

        if (result.ok) {
            showToast(`Buku ID #${deletingBookId} berhasil dihapus.`, 'success');
            closeModal('modal-delete');

            const getResult = await sendApiRequest('GET', getApiUrl());
            if (getResult.ok && getResult.data && getResult.data.data) {
                booksData = getResult.data.data;
                renderBooks();
            }
            saveHistory('DELETE', url, '');
            updateStats();
        } else {
            showToast(result.data?.message || 'Gagal menghapus buku.', 'error');
        }
    });

    // ========================================
    //  Stats Update
    // ========================================
    function updateStats() {
        statTotal.textContent = booksData.length;
        statRequests.textContent = totalRequests;
        statLastStatus.textContent = lastStatus;

        if (responseTimes.length > 0) {
            const avg = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
            statAvgTime.textContent = `${avg} ms`;
        }

        // Update architecture IP
        document.getElementById('arch-server-ip').textContent = serverIpInput.value.trim();
    }

    // ========================================
    //  History
    // ========================================
    function saveHistory(method, url, body) {
        let history = getHistory();
        history = history.filter(h => !(h.method === method && h.url === url));
        history.unshift({ method, url, body, timestamp: new Date().toISOString() });
        if (history.length > 15) history = history.slice(0, 15);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        renderHistory();
    }

    function getHistory() {
        try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
        catch { return []; }
    }

    function renderHistory() {
        const history = getHistory();
        sidebarHistory.innerHTML = '';

        if (history.length === 0) {
            sidebarHistory.innerHTML = '<div class="history-entry"><span class="history-path" style="color:var(--text-tertiary)">Belum ada riwayat</span></div>';
            return;
        }

        history.forEach(item => {
            const entry = document.createElement('div');
            entry.className = 'history-entry';
            entry.innerHTML = `
                <span class="history-method ${item.method}">${item.method}</span>
                <span class="history-path">${item.url.replace(/https?:\/\/[^/]+/, '')}</span>
            `;
            entry.addEventListener('click', () => {
                switchView('api');
                methodSelect.value = item.method;
                methodSelect.dispatchEvent(new Event('change'));
                urlInput.value = item.url;
                if (item.body) requestBody.value = item.body;
            });
            sidebarHistory.appendChild(entry);
        });
    }

    btnClearHistory.addEventListener('click', () => {
        localStorage.removeItem(HISTORY_KEY);
        renderHistory();
        showToast('Riwayat request dihapus.', 'info');
    });

    // ========================================
    //  Init
    // ========================================
    updateUrlBar();
    updateMethodColors();
    renderHistory();
    updateStats();
});
