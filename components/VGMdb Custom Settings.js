(function(global) {
    'use strict';

    const VERSION = '1.0.0';
    const DEFAULT_STORAGE_KEY = 'vgmdbCustomSettings';
    const DEFAULT_CONTAINER_ID = 'customSettingsContainer';

    function isObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value);
    }

    function parseStoredSettings(raw) {
        if (!raw) return {};

        try {
            const parsed = JSON.parse(raw);
            return isObject(parsed) ? parsed : {};
        } catch (error) {
            console.warn('[VGMdbCustomSettings] Invalid stored JSON, resetting settings.', error);
            return {};
        }
    }

    function createStorage(storageKey) {
        return {
            load: function() {
                return parseStoredSettings(localStorage.getItem(storageKey));
            },
            save: function(settings) {
                localStorage.setItem(storageKey, JSON.stringify(settings));
            }
        };
    }

    function getValue(settings, item) {
        if (Object.prototype.hasOwnProperty.call(settings, item.id)) {
            return settings[item.id];
        }
        return item.default;
    }

    function createCheckboxInput(item, value, updateValue) {
        const container = document.createElement('div');
        container.className = 'smallfont';
        container.innerHTML = '' +
            '<input type="checkbox" id="' + item.id + '" ' + (value ? 'checked' : '') + '>' +
            '<label for="' + item.id + '">' + item.label + '</label>';

        const input = container.querySelector('#' + item.id);
        input.addEventListener('change', function() {
            updateValue(this.checked);
        });

        return container;
    }

    function createRadioInput(item, value, updateValue) {
        const container = document.createElement('div');
        container.className = 'smallfont';

        item.options.forEach(function(option) {
            const radioContainer = document.createElement('div');
            radioContainer.innerHTML = '' +
                '<input type="radio" name="' + item.id + '" id="' + item.id + '_' + option.value + '" value="' + option.value + '" ' + (value === option.value ? 'checked' : '') + '>' +
                '<label for="' + item.id + '_' + option.value + '">' + option.label + '</label>';
            container.appendChild(radioContainer);
        });

        container.querySelectorAll('input[name="' + item.id + '"]').forEach(function(input) {
            input.addEventListener('change', function() {
                if (this.checked) {
                    updateValue(this.value);
                }
            });
        });

        return container;
    }

    function createTristateInput(item, initialState, updateValue) {
        const container = document.createElement('div');
        container.className = 'smallfont';

        const stateMap = { off: '0', on: '2', null: '3' };
        const valueMap = { '0': 'off', '2': 'on', '3': 'null' };
        const stateCycle = ['null', 'on', 'off'];

        let currentState = stateMap[initialState] ? initialState : 'null';
        const radioName = 'category[' + item.id + ']';
        const radioId = 'op_' + item.id;

        container.innerHTML = '' +
            '<label class="tristate tristate-' + currentState + '" for="' + radioId + '" style="cursor: pointer;">' +
                '<input type="radio" autocomplete="off" name="' + radioName + '" value="0" style="display: none;" ' + (currentState === 'off' ? 'checked' : '') + '>' +
                '<input type="radio" autocomplete="off" name="' + radioName + '" value="1" style="display: none;">' +
                '<input type="radio" autocomplete="off" name="' + radioName + '" value="2" style="display: none;" ' + (currentState === 'on' ? 'checked' : '') + '>' +
                '<input type="radio" autocomplete="off" name="' + radioName + '" value="3" style="display: none;" ' + (currentState === 'null' ? 'checked' : '') + '>' +
                item.label +
            '</label>';

        const labelElement = container.querySelector('label');
        const radios = container.querySelectorAll('input[name="' + radioName + '"]');

        labelElement.addEventListener('click', function(event) {
            event.preventDefault();

            const currentIndex = stateCycle.indexOf(currentState);
            const nextState = stateCycle[(currentIndex + 1) % stateCycle.length];
            currentState = nextState;
            labelElement.className = 'tristate tristate-' + currentState;

            radios.forEach(function(radio) {
                radio.checked = radio.value === stateMap[currentState];
            });

            updateValue(valueMap[stateMap[currentState]]);
        });

        labelElement.addEventListener('mouseenter', function() {
            this.classList.add('tristate-hover');
        });

        labelElement.addEventListener('mouseleave', function() {
            this.classList.remove('tristate-hover');
        });

        return container;
    }

    function findSettingsPanel() {
        const prefContent = document.getElementById('pref_content');
        if (!prefContent) return null;

        const panel = prefContent.querySelector('table.panel');
        if (!panel) return null;

        return panel.querySelector('td:first-child');
    }

    function createManager(options) {
        const config = isObject(options && options.config) ? options.config : {};
        const storageKey = options && options.storageKey ? options.storageKey : DEFAULT_STORAGE_KEY;
        const containerId = options && options.containerId ? options.containerId : DEFAULT_CONTAINER_ID;

        const storage = createStorage(storageKey);
        let settings = storage.load();
        let observer = null;

        function saveSettings(nextSettings) {
            settings = isObject(nextSettings) ? nextSettings : {};
            storage.save(settings);
        }

        function loadSettings() {
            settings = storage.load();
            return Object.assign({}, settings);
        }

        function setSetting(id, value) {
            settings[id] = value;
            storage.save(settings);
            return value;
        }

        function getSetting(id, fallbackValue) {
            if (Object.prototype.hasOwnProperty.call(settings, id)) {
                return settings[id];
            }
            return fallbackValue;
        }

        function ensureContainer() {
            let container = document.getElementById(containerId);
            if (container) return container;

            const column = findSettingsPanel();
            if (!column) return null;

            container = document.createElement('div');
            container.id = containerId;
            column.appendChild(container);

            return container;
        }

        function renderInto(container) {
            container.innerHTML = '';

            Object.entries(config).forEach(function(entry) {
                const sectionLabel = entry[0];
                const sectionItems = Array.isArray(entry[1]) ? entry[1] : [];

                const fieldset = document.createElement('fieldset');
                fieldset.className = 'fieldset';
                fieldset.style.margin = '0';

                const legend = document.createElement('legend');
                legend.textContent = sectionLabel;
                fieldset.appendChild(legend);

                const table = document.createElement('table');
                table.cellPadding = '0';
                table.cellSpacing = '0';
                table.border = '0';
                table.width = '100%';

                const tbody = document.createElement('tbody');
                let tr = document.createElement('tr');
                let colCount = 0;

                sectionItems.forEach(function(item) {
                    if (!item || !item.id || !item.type) return;

                    const td = document.createElement('td');
                    td.width = '33%';
                    td.valign = 'top';

                    const initialValue = getValue(settings, item);
                    const updateValue = function(nextValue) {
                        setSetting(item.id, nextValue);

                        if (typeof item.onChange === 'function') {
                            item.onChange(nextValue, Object.assign({}, settings), api);
                        }
                    };

                    let input = null;
                    if (item.type === 'checkbox') {
                        input = createCheckboxInput(item, initialValue, updateValue);
                    } else if (item.type === 'radio') {
                        input = createRadioInput(item, initialValue, updateValue);
                    } else if (item.type === 'tristate') {
                        input = createTristateInput(item, initialValue, updateValue);
                    } else {
                        console.error('[VGMdbCustomSettings] Unknown input type:', item.type);
                    }

                    if (input) {
                        td.appendChild(input);
                        tr.appendChild(td);
                        colCount += 1;

                        // When we reach 3 columns, push the row and start a new one
                        if (colCount % 3 === 0) {
                            tbody.appendChild(tr);
                            tr = document.createElement('tr');
                            colCount = 0;
                        }
                    }
                });

                // Append any remaining cells (if items not multiple of 3)
                if (colCount !== 0) {
                    tbody.appendChild(tr);
                }
                
                table.appendChild(tbody);
                fieldset.appendChild(table);
                container.appendChild(fieldset);
            });
        }

        function disconnectObserver() {
            if (!observer) return;
            observer.disconnect();
            observer = null;
        }

        function mount() {
            const container = ensureContainer();
            if (container) {
                renderInto(container);
                disconnectObserver();
                return true;
            }

            if (observer) return false;

            const pref = document.getElementById('pref') || document.body;
            if (!pref) return false;

            observer = new MutationObserver(function() {
                const canMount = document.getElementById('pref') && document.getElementById('pref').style.display !== 'none';
                if (!canMount) return;

                const dynamicContainer = ensureContainer();
                if (!dynamicContainer) return;

                renderInto(dynamicContainer);
                disconnectObserver();
            });

            observer.observe(pref, { attributes: true, childList: true, subtree: true });
            return false;
        }

        function unmount() {
            disconnectObserver();

            const container = document.getElementById(containerId);
            if (container) {
                container.remove();
            }
        }

        function rerender() {
            const container = document.getElementById(containerId);
            if (!container) {
                return mount();
            }

            renderInto(container);
            return true;
        }

        function addSection(sectionLabel, sectionItems) {
            if (!sectionLabel || !Array.isArray(sectionItems)) return false;
            config[sectionLabel] = sectionItems;
            return rerender();
        }

        function addItem(sectionLabel, item) {
            if (!sectionLabel || !item || !item.id || !item.type) return false;
            if (!Array.isArray(config[sectionLabel])) {
                config[sectionLabel] = [];
            }
            config[sectionLabel].push(item);
            return rerender();
        }

        const api = {
            version: VERSION,
            mount: mount,
            unmount: unmount,
            rerender: rerender,
            loadSettings: loadSettings,
            saveSettings: saveSettings,
            getSetting: getSetting,
            setSetting: setSetting,
            addSection: addSection,
            addItem: addItem,
            getConfig: function() {
                return config;
            }
        };

        return api;
    }

    global.VGMdbCustomSettings = {
        version: VERSION,
        createManager: createManager,
        init: function(options) {
            const manager = createManager(options || {});
            manager.mount();
            return manager;
        }
    };
})(window);
