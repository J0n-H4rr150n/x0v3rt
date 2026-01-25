/**
 * Dialog Utility - ES Module
 */

const Dialog = {
    removeOverlays() {
        document.querySelectorAll('.dialog-overlay').forEach((node) => node.remove());
    },

    async showInput(title, placeholder = '', defaultValue = '') {
        return new Promise((resolve) => {
            this.removeOverlays();

            const overlay = document.createElement('div');
            overlay.className = 'dialog-overlay';

            const dialog = document.createElement('div');
            dialog.className = 'dialog-box';

            dialog.innerHTML = `
                <div class="dialog-header">${title}</div>
                <div class="dialog-body">
                    <input
                        type="text"
                        class="dialog-input"
                        placeholder="${placeholder}"
                        value="${defaultValue}"
                        autocomplete="off"
                    />
                </div>
                <div class="dialog-actions">
                    <button class="btn-secondary dialog-cancel">Cancel</button>
                    <button class="btn-primary dialog-ok">OK</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const input = dialog.querySelector('.dialog-input');
            const okBtn = dialog.querySelector('.dialog-ok');
            const cancelBtn = dialog.querySelector('.dialog-cancel');

            setTimeout(() => input.focus(), 50);

            const handleOk = () => {
                const value = input.value.trim();
                this.removeOverlays();
                resolve(value || null);
            };

            const handleCancel = () => {
                this.removeOverlays();
                resolve(null);
            };

            okBtn.addEventListener('click', handleOk);
            cancelBtn.addEventListener('click', handleCancel);

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleOk();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancel();
                }
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    handleCancel();
                }
            });
        });
    },

    async showConfirm(title, message, options = {}) {
        const {
            confirmLabel = 'Confirm',
            cancelLabel = 'Cancel',
            danger = false
        } = options;

        return new Promise((resolve) => {
            this.removeOverlays();

            const overlay = document.createElement('div');
            overlay.className = 'dialog-overlay';

            const dialog = document.createElement('div');
            dialog.className = 'dialog-box';

            dialog.innerHTML = `
                <div class="dialog-header">${title}</div>
                <div class="dialog-body">
                    <div class="dialog-message">${message}</div>
                </div>
                <div class="dialog-actions">
                    <button class="btn-secondary dialog-cancel">${cancelLabel}</button>
                    <button class="btn-primary ${danger ? 'dialog-danger' : ''} dialog-ok">${confirmLabel}</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const okBtn = dialog.querySelector('.dialog-ok');
            const cancelBtn = dialog.querySelector('.dialog-cancel');

            const handleOk = () => {
                this.removeOverlays();
                resolve(true);
            };

            const handleCancel = () => {
                this.removeOverlays();
                resolve(false);
            };

            okBtn.addEventListener('click', handleOk);
            cancelBtn.addEventListener('click', handleCancel);

            document.addEventListener('keydown', function onKeydown(e) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    document.removeEventListener('keydown', onKeydown);
                    handleCancel();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    document.removeEventListener('keydown', onKeydown);
                    handleOk();
                }
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    handleCancel();
                }
            });
        });
    }
};

window.Dialog = Dialog;

export default Dialog;
