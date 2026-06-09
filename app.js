/* =========================================================
   Rutina 4 Días — app.js
   Toggle de tema claro/oscuro con persistencia en localStorage.
   Respeta la preferencia del sistema si no hay elección previa.
   ========================================================= */

(function () {
    'use strict';

    const STORAGE_KEY = 'rutina4d:theme';
    const root = document.documentElement;
    const toggleBtn = document.getElementById('theme-toggle');

    /**
     * Devuelve el tema preferido por el usuario.
     * Prioridad: localStorage > prefers-color-scheme > 'light'.
     */
    function getPreferredTheme() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === 'light' || stored === 'dark') {
                return stored;
            }
        } catch (e) {
            // localStorage no disponible (modo privado, etc.) — caemos al sistema.
        }

        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    /**
     * Aplica el tema al <html> y actualiza aria-label.
     */
    function applyTheme(theme) {
        root.setAttribute('data-theme', theme);
        if (toggleBtn) {
            const label = theme === 'dark'
                ? 'Cambiar a tema claro'
                : 'Cambiar a tema oscuro';
            toggleBtn.setAttribute('aria-label', label);
            toggleBtn.setAttribute('title', label);
        }
    }

    /**
     * Persiste la elección del usuario.
     */
    function persistTheme(theme) {
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch (e) {
            // Sin persistencia: la preferencia vivirá solo en esta sesión.
        }
    }

    /**
     * Maneja el click en el botón de toggle.
     */
    function handleToggle() {
        const current = root.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        persistTheme(next);
    }

    // Inicialización
    const initialTheme = getPreferredTheme();
    applyTheme(initialTheme);

    if (toggleBtn) {
        toggleBtn.addEventListener('click', handleToggle);
    }

    // Si el usuario no ha elegido manualmente, reaccionar a cambios del sistema.
    if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handleSystemChange = (e) => {
            try {
                if (!localStorage.getItem(STORAGE_KEY)) {
                    applyTheme(e.matches ? 'dark' : 'light');
                }
            } catch (err) {
                // Ignorar.
            }
        };
        if (mq.addEventListener) {
            mq.addEventListener('change', handleSystemChange);
        } else if (mq.addListener) {
            // Compatibilidad con navegadores antiguos.
            mq.addListener(handleSystemChange);
        }
    }
})();

/* =========================================================
   Progresión — registro de pesos por ejercicio
   Persistencia en localStorage. Vanilla JS, sin frameworks.
   ========================================================= */
(function () {
    'use strict';

    const STORAGE_KEY = 'rutina4d:progression:v1'; // (legacy localStorage, ya no se usa)

    // Catálogo de ejercicios extraído de la rutina (mismo orden y nombres).
    const DAYS = [
        {
            id: 'd1',
            tag: 'Día 1',
            title: 'Espalda — Hombros',
            exercises: [
                { id: 'd1-1', name: 'Remo gironda' },
                { id: 'd1-2', name: 'Jalón al Pecho (Agarre Neutro o cerrado)' },
                { id: 'd1-3', name: 'Remo con Mancuernas' },
                { id: 'd1-4', name: 'Remo T (Ir Variando Agarre)' },
                { id: 'd1-5', name: 'Press Militar con mancuernas' },
                { id: 'd1-6', name: 'Face Pull' }
            ]
        },
        {
            id: 'd2',
            tag: 'Día 2',
            title: 'Pecho — Brazos',
            exercises: [
                { id: 'd2-1', name: 'Press Inclinado con Mancuernas' },
                { id: 'd2-2', name: 'Peck Deck' },
                { id: 'd2-3', name: 'Cruces en Polea Baja' },
                { id: 'd2-4', name: 'Bíceps Martillo' },
                { id: 'd2-5', name: 'Tríceps Tras Nuca con mancuernas' },
                { id: 'd2-6', name: 'Puente / Plancha' }
            ]
        },
        {
            id: 'd3',
            tag: 'Día 3',
            title: 'Tren Inferior',
            exercises: [
                { id: 'd3-1', name: 'Sentadilla en cajón con mancuernas' },
                { id: 'd3-2', name: 'Sillón de isquios' },
                { id: 'd3-3', name: 'Prensa 45' },
                { id: 'd3-4', name: 'Sentadilla Goblet' },
                { id: 'd3-5', name: 'Gemelos en step con mancuernas' }
            ]
        },
        {
            id: 'd4',
            tag: 'Día 4',
            title: 'Tren Superior',
            exercises: [
                { id: 'd4-1', name: 'Press de Banca' },
                { id: 'd4-2', name: 'Remo Unilateral en Polea' },
                { id: 'd4-3', name: 'Flexión de brazo apoyado en banco' },
                { id: 'd4-4', name: 'Remo Gironda' },
                { id: 'd4-5', name: 'Vuelos Laterales en Polea Baja' },
                { id: 'd4-6', name: 'Bíceps en polea con Barra' }
            ]
        }
    ];

    // ---- Almacenamiento (Firestore) ----
    // Estructura: colección "progression", documento por exerciseId,
    // con un array "entries" que mantiene la forma anterior.
    const COLLECTION_NAME = 'progression';

    // Cache en memoria para no pegarle a Firestore en cada render.
    const cache = { loaded: false, data: {} };

    function exDocRef(exerciseId) {
        return window.fbDb.collection(COLLECTION_NAME).doc(exerciseId);
    }

    async function loadAll() {
        if (cache.loaded) return cache.data;
        try {
            const snap = await window.fbDb.collection(COLLECTION_NAME).get();
            const data = {};
            snap.forEach(doc => {
                const v = doc.data();
                if (v && Array.isArray(v.entries)) {
                    data[doc.id] = v.entries;
                }
            });
            cache.data = data;
            cache.loaded = true;
            return data;
        } catch (e) {
            console.error('Firestore loadAll:', e);
            showToast('No se pudieron cargar los registros.');
            return {};
        }
    }

    async function saveAll(data) {
        // Escribe la colección completa: borra los docs que ya no estén
        // y reemplaza los que sí, para reflejar la importación.
        try {
            const existing = await window.fbDb.collection(COLLECTION_NAME).get();
            const batch = window.fbDb.batch();
            const keep = new Set(Object.keys(data));
            existing.forEach(doc => {
                if (!keep.has(doc.id)) {
                    batch.delete(doc.ref);
                }
            });
            Object.keys(data).forEach(id => {
                batch.set(exDocRef(id), { entries: data[id] });
            });
            await batch.commit();
            cache.data = data;
            cache.loaded = true;
        } catch (e) {
            console.error('Firestore saveAll:', e);
            showToast('No se pudo guardar en Firestore.');
        }
    }

    async function getEntries(exerciseId) {
        const all = await loadAll();
        const list = all[exerciseId];
        if (!Array.isArray(list)) return [];
        // Ordenar ascendente por fecha para que la gráfica quede bien.
        return list.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    async function setEntries(exerciseId, entries) {
        try {
            if (!entries || entries.length === 0) {
                await exDocRef(exerciseId).delete();
            } else {
                await exDocRef(exerciseId).set({ entries });
            }
            cache.data[exerciseId] = entries || [];
            // Limpiar la clave si quedó vacía.
            if (!entries || entries.length === 0) {
                delete cache.data[exerciseId];
            }
        } catch (e) {
            console.error('Firestore setEntries:', e);
            showToast('No se pudo guardar el registro.');
        }
    }

    async function addEntry(exerciseId, entry) {
        const entries = await getEntries(exerciseId);
        entries.push(entry);
        await setEntries(exerciseId, entries);
    }

    async function removeEntry(exerciseId, entryId) {
        const entries = (await getEntries(exerciseId)).filter(e => e.id !== entryId);
        await setEntries(exerciseId, entries);
    }

    // Invalidar cache (usado por "Borrar todo").
    function invalidateCache() {
        cache.loaded = false;
        cache.data = {};
    }

    // ---- Utilidades de fecha ----
    function todayISO() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

    function formatDate(iso) {
        // iso: YYYY-MM-DD
        if (!iso) return '';
        const [y, m, d] = iso.split('-').map(Number);
        if (!y || !m || !d) return iso;
        return `${String(d).padStart(2, '0')} ${MONTHS_ES[m - 1]} ${y}`;
    }

    function formatNumber(n) {
        if (typeof n !== 'number' || isNaN(n)) return '—';
        // Mostrar hasta 1 decimal sin ceros innecesarios.
        return (Math.round(n * 10) / 10).toString();
    }

    function uid() {
        return 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    // ---- Toast ----
    let toastTimer = null;
    function showToast(message) {
        let toast = document.querySelector('.toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            toast.setAttribute('role', 'status');
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        // Forzar reflow para que la transición se dispare
        void toast.offsetWidth;
        toast.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.classList.remove('is-visible');
        }, 2400);
    }

    // ---- Render ----
    const root = document.getElementById('progress-app');
    if (!root) return;

    function escapeHTML(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    async function getLastEntry(exerciseId) {
        const entries = await getEntries(exerciseId);
        return entries.length ? entries[entries.length - 1] : null;
    }

    async function getDelta(exerciseId) {
        const entries = await getEntries(exerciseId);
        if (entries.length < 2) return null;
        const prev = entries[entries.length - 2].weight;
        const last = entries[entries.length - 1].weight;
        return last - prev;
    }

    function renderEmptyState() {
        return `
            <div class="progress-global-empty">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 3v18h18"/>
                    <path d="M7 14l4-4 4 4 5-7"/>
                </svg>
                <p>Aún no hay registros. Empezá cargando el primer peso en cualquier ejercicio de la rutina.</p>
            </div>
        `;
    }

    async function renderExercise(ex) {
        const entries = await getEntries(ex.id);
        const last = await getLastEntry(ex.id);
        const delta = await getDelta(ex.id);

        const deltaHTML = delta == null
            ? ''
            : (delta > 0
                ? `<span class="delta delta-up">+${formatNumber(delta)} kg</span>`
                : delta < 0
                    ? `<span class="delta delta-down">${formatNumber(delta)} kg</span>`
                    : `<span class="delta">= 0 kg</span>`);

        const lastBlock = last
            ? `<span class="progress-ex-last">Último: <span class="num">${formatNumber(last.weight)}</span><span class="unit">kg</span> · ${escapeHTML(formatDate(last.date))} ${deltaHTML}</span>`
            : `<span class="progress-ex-last"><span class="unit">Sin registros</span></span>`;

        return `
            <li class="progress-ex" data-ex-id="${ex.id}">
                <div class="progress-ex-head">
                    <div class="progress-ex-name">${escapeHTML(ex.name)}</div>
                    ${lastBlock}
                </div>

                <form class="progress-form" data-ex-id="${ex.id}" novalidate>
                    <div class="progress-form-field">
                        <label for="weight-${ex.id}">Peso (kg)</label>
                        <input type="number" inputmode="decimal" step="0.5" min="0" max="1000"
                               id="weight-${ex.id}" name="weight" placeholder="ej. 60" required>
                    </div>
                    <div class="progress-form-field">
                        <label for="date-${ex.id}">Fecha</label>
                        <input type="date" id="date-${ex.id}" name="date" value="${todayISO()}" required>
                    </div>
                    <div class="progress-form-field">
                        <label for="note-${ex.id}">Nota (opcional)</label>
                        <input type="text" id="note-${ex.id}" name="note" placeholder="—" maxlength="60">
                    </div>
                    <div class="progress-form-actions">
                        <button type="submit" class="btn btn-primary">Registrar</button>
                    </div>
                    <div class="progress-form-error" role="alert"></div>
                </form>

                ${renderHistory(ex.id, entries)}
            </li>
        `;
    }

    function renderHistory(exerciseId, entries) {
        if (!entries.length) {
            return `<div class="progress-empty">Sin registros todavía.</div>`;
        }
        // Mostrar últimos N, más recientes primero
        const recent = entries.slice().reverse().slice(0, 6);
        const latestId = entries[entries.length - 1].id;
        const rows = recent.map((e, idx) => {
            const isLatest = e.id === latestId;
            const note = e.note ? escapeHTML(e.note) : '<span style="opacity:.4">—</span>';
            return `
                <div class="progress-row ${isLatest ? 'is-latest' : ''}" data-entry-id="${e.id}">
                    <div class="cell-date">${escapeHTML(formatDate(e.date))}</div>
                    <div class="cell-weight">${formatNumber(e.weight)}<span class="unit">kg</span></div>
                    <div class="cell-note" title="${escapeHTML(e.note || '')}">${note}</div>
                    <div class="cell-actions">
                        <button type="button" class="btn btn-ghost btn-icon" data-action="delete" data-ex-id="${exerciseId}" data-entry-id="${e.id}" aria-label="Eliminar registro del ${escapeHTML(formatDate(e.date))}" title="Eliminar">
                            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="progress-history">
                ${renderChart(exerciseId, entries)}
                <div class="progress-history-head">
                    <span class="progress-history-title">Historial (últimos ${recent.length}${entries.length > recent.length ? ` de ${entries.length}` : ''})</span>
                </div>
                <div class="progress-list">
                    ${rows}
                </div>
            </div>
        `;
    }

    function renderChart(exerciseId, entries) {
        if (entries.length < 2) return '';
        const w = 600, h = 80, padX = 8, padY = 10;
        const weights = entries.map(e => e.weight);
        const minW = Math.min(...weights);
        const maxW = Math.max(...weights);
        const range = (maxW - minW) || 1;
        const stepX = (w - padX * 2) / (entries.length - 1);

        const points = entries.map((e, i) => {
            const x = padX + i * stepX;
            const y = h - padY - ((e.weight - minW) / range) * (h - padY * 2);
            return { x, y, weight: e.weight, date: e.date };
        });

        const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        const areaPath = `M${points[0].x.toFixed(1)},${h} L${linePath.split(' ').slice(1).join(' ')} L${points[points.length-1].x.toFixed(1)},${h} Z`;
        const pts = points.map((p, i) => {
            const isLast = i === points.length - 1;
            return `<circle class="${isLast ? 'point-latest' : 'point'}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${isLast ? 4 : 2.5}"><title>${escapeHTML(formatDate(p.date))} · ${formatNumber(p.weight)} kg</title></circle>`;
        }).join('');

        return `
            <div class="progress-chart-wrap" aria-label="Gráfica de progresión">
                <svg class="progress-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img">
                    <line class="axis" x1="${padX}" y1="${h - padY}" x2="${w - padX}" y2="${h - padY}"/>
                    <path class="area" d="${areaPath}"/>
                    <path class="line" d="${linePath}"/>
                    ${pts}
                </svg>
                <div class="progress-chart-meta">
                    <span>Mín: ${formatNumber(minW)} kg</span>
                    <span>Máx: ${formatNumber(maxW)} kg</span>
                </div>
            </div>
        `;
    }

    async function renderSummary() {
        const all = await loadAll();
        let totalReg = 0;
        let exWithReg = 0;
        let lastDate = null;
        DAYS.forEach(d => {
            d.exercises.forEach(e => {
                const list = all[e.id];
                if (Array.isArray(list) && list.length) {
                    exWithReg++;
                    totalReg += list.length;
                    const dStr = list[list.length - 1].date;
                    if (!lastDate || dStr > lastDate) lastDate = dStr;
                }
            });
        });

        return `
            <div class="progress-toolbar">
                <div class="progress-summary">
                    <div class="summary-stat">
                        <span class="label">Ejercicios con registro</span>
                        <span class="value">${exWithReg} / ${DAYS.reduce((acc, d) => acc + d.exercises.length, 0)}</span>
                    </div>
                    <div class="summary-stat">
                        <span class="label">Registros totales</span>
                        <span class="value">${totalReg}</span>
                    </div>
                    <div class="summary-stat">
                        <span class="label">Último registro</span>
                        <span class="value">${lastDate ? escapeHTML(formatDate(lastDate)) : '—'}</span>
                    </div>
                </div>
                <div class="progress-actions">
                    <button type="button" class="btn" id="export-progress" ${totalReg === 0 ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''}>Exportar JSON</button>
                    <button type="button" class="btn" id="import-progress">Importar</button>
                    <input type="file" id="import-file" accept="application/json" hidden>
                    <button type="button" class="btn" id="clear-progress" ${totalReg === 0 ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''}>Borrar todo</button>
                </div>
            </div>
        `;
    }

    function renderDay(day) {
        return `
            <article class="progress-day">
                <div class="progress-day-head">
                    <span class="day-tag">${day.tag}</span>
                    <h3>${day.title}</h3>
                </div>
                <ul class="progress-exercises">
                    ${day.exercises.map(renderExercise).join('')}
                </ul>
            </article>
        `;
    }

    async function render() {
        const all = await loadAll();
        const total = DAYS.reduce((acc, d) => acc + d.exercises.length, 0);
        let anyRecord = false;
        for (const d of DAYS) {
            for (const e of d.exercises) {
                const list = all[e.id];
                if (Array.isArray(list) && list.length) { anyRecord = true; break; }
            }
            if (anyRecord) break;
        }

        // Renderizar ejercicios y días en paralelo.
        const dayHTMLs = await Promise.all(DAYS.map(d => Promise.all(d.exercises.map(renderExercise)).then(parts => `
            <article class="progress-day">
                <div class="progress-day-head">
                    <span class="day-tag">${d.tag}</span>
                    <h3>${d.title}</h3>
                </div>
                <ul class="progress-exercises">
                    ${parts.join('')}
                </ul>
            </article>
        `)));

        const summaryHTML = await renderSummary();
        root.innerHTML = `
            ${summaryHTML}
            ${anyRecord ? dayHTMLs.join('') : renderEmptyState() + dayHTMLs.join('')}
        `;
    }

    // ---- Handlers ----
    async function handleSubmit(e) {
        const form = e.target.closest('.progress-form');
        if (!form) return;
        e.preventDefault();
        const exId = form.dataset.exId;
        const weight = parseFloat(form.weight.value);
        const date = form.date.value;
        const note = (form.note.value || '').trim();

        const errorEl = form.querySelector('.progress-form-error');
        form.classList.remove('has-error');
        errorEl.textContent = '';

        if (!date || isNaN(weight) || weight <= 0 || weight > 1000) {
            form.classList.add('has-error');
            errorEl.textContent = 'Ingresá un peso válido (> 0) y una fecha.';
            return;
        }

        await addEntry(exId, {
            id: uid(),
            date,
            weight,
            note,
            createdAt: new Date().toISOString()
        });

        showToast('Registro guardado');
        render();
    }

    async function handleClick(e) {
        const btn = e.target.closest('[data-action="delete"]');
        if (btn) {
            const exId = btn.dataset.exId;
            const entryId = btn.dataset.entryId;
            await removeEntry(exId, entryId);
            showToast('Registro eliminado');
            render();
            return;
        }

        const clearBtn = e.target.closest('#clear-progress');
        if (clearBtn) {
            const enabled = !clearBtn.hasAttribute('disabled');
            if (!enabled) return;
            if (confirm('¿Borrar todos los registros de progresión? Esta acción no se puede deshacer.')) {
                try {
                    const snap = await window.fbDb.collection(COLLECTION_NAME).get();
                    const batch = window.fbDb.batch();
                    snap.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                    invalidateCache();
                } catch (err) {
                    console.error('Firestore clear:', err);
                    showToast('No se pudo borrar.');
                }
                showToast('Progresión borrada');
                render();
            }
            return;
        }

        const exportBtn = e.target.closest('#export-progress');
        if (exportBtn) {
            const data = await loadAll();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `progresion-${todayISO()}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showToast('Exportado');
            return;
        }

        if (e.target.closest('#import-progress')) {
            document.getElementById('import-file').click();
            return;
        }
    }

    async function handleImportChange(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (typeof data !== 'object' || data === null) throw new Error('Formato inválido');
                // Validación superficial
                for (const key of Object.keys(data)) {
                    if (!Array.isArray(data[key])) throw new Error('Estructura inválida');
                }
                await saveAll(data);
                showToast('Importación completa');
                render();
            } catch (err) {
                showToast('Archivo inválido');
            } finally {
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    // Listeners (delegados)
    root.addEventListener('submit', handleSubmit);
    root.addEventListener('click', handleClick);
    document.addEventListener('change', (e) => {
        if (e.target && e.target.id === 'import-file') handleImportChange(e);
    });

    render();
})();
