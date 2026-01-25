/**
 * Layout utilities for resizable/collapsible sidebars
 */

const Layout = {
    leftWidth: 250,
    rightWidth: 350,
    minLeft: 180,
    minRight: 220,
    maxLeftRatio: 0.5,
    maxRightRatio: 0.5,
    leftCollapsed: false,
    rightCollapsed: false,
    activeLeftView: 'explorer', // or 'extensions'

    init() {
        console.debug('[Layout] init start');
        this.container = document.querySelector('.app-container');
        this.leftSidebar = document.getElementById('explorer-sidebar');
        this.rightSidebar = document.querySelector('.ai-sidebar');
        this.leftResizer = document.getElementById('left-resizer');
        this.rightResizer = document.getElementById('right-resizer');
        this.activityExplorer = document.getElementById('activity-explorer');
        this.activityExtensions = document.getElementById('activity-extensions');
        this.activityAI = document.getElementById('activity-ai');
        this.activityAIRight = document.getElementById('activity-ai-right');
        this.explorerSidebar = document.getElementById('explorer-sidebar');
        this.extensionsSidebar = document.getElementById('extensions-sidebar');

        console.debug('[Layout] init elements', {
            container: Boolean(this.container),
            leftSidebar: Boolean(this.leftSidebar),
            rightSidebar: Boolean(this.rightSidebar),
            leftResizer: Boolean(this.leftResizer),
            rightResizer: Boolean(this.rightResizer),
            activityExplorer: Boolean(this.activityExplorer),
            activityExtensions: Boolean(this.activityExtensions),
            activityAI: Boolean(this.activityAI),
            activityAIRight: Boolean(this.activityAIRight),
            explorerSidebar: Boolean(this.explorerSidebar),
            extensionsSidebar: Boolean(this.extensionsSidebar)
        });

        this.loadState();
        this.applyLayout();

        if (this.leftResizer) {
            this.leftResizer.addEventListener('pointerdown', (event) => this.startResize(event, 'left'));
        }
        if (this.rightResizer) {
            this.rightResizer.addEventListener('pointerdown', (event) => this.startResize(event, 'right'));
        }
        if (this.activityExplorer) {
            this.activityExplorer.addEventListener('click', () => {
                console.debug('[Layout] Activity click: explorer');
                this.switchLeftView('explorer');
            });
        }
        if (this.activityExtensions) {
            this.activityExtensions.addEventListener('click', () => {
                console.debug('[Layout] Activity click: extensions');
                this.switchLeftView('extensions');
            });
        }
        if (this.activityAI) {
            this.activityAI.addEventListener('click', () => {
                console.info('[Layout] Activity click: ai');
                this.toggleSidebar('right', { forceOpen: true });
            });
        }
        if (this.activityAIRight) {
            this.activityAIRight.addEventListener('click', () => {
                console.info('[Layout] Activity click: ai-right');
                this.toggleSidebar('right', { forceOpen: true });
            });
        }

        console.debug('[Layout] init complete');
    },

    loadState() {
        try {
            const savedLeft = localStorage.getItem('x0v3rt:layout:leftWidth');
            const savedRight = localStorage.getItem('x0v3rt:layout:rightWidth');
            const leftCollapsed = localStorage.getItem('x0v3rt:layout:leftCollapsed');
            const rightCollapsed = localStorage.getItem('x0v3rt:layout:rightCollapsed');

            if (savedLeft) this.leftWidth = Number(savedLeft) || this.leftWidth;
            if (savedRight) this.rightWidth = Number(savedRight) || this.rightWidth;
            this.leftCollapsed = leftCollapsed === 'true';
            this.rightCollapsed = rightCollapsed === 'true';
        } catch (error) {
            console.warn('Failed to load layout state:', error);
        }
    },

    persistState() {
        try {
            localStorage.setItem('x0v3rt:layout:leftWidth', String(this.leftWidth));
            localStorage.setItem('x0v3rt:layout:rightWidth', String(this.rightWidth));
            localStorage.setItem('x0v3rt:layout:leftCollapsed', String(this.leftCollapsed));
            localStorage.setItem('x0v3rt:layout:rightCollapsed', String(this.rightCollapsed));
        } catch (error) {
            console.warn('Failed to persist layout state:', error);
        }
    },

    applyLayout() {
        if (!this.container) return;
        const containerWidth = this.container.clientWidth || window.innerWidth;
        const maxLeft = Math.floor(containerWidth * this.maxLeftRatio);
        const maxRight = Math.floor(containerWidth * this.maxRightRatio);

        this.leftWidth = Math.min(Math.max(this.leftWidth, this.minLeft), maxLeft);
        this.rightWidth = Math.min(Math.max(this.rightWidth, this.minRight), maxRight);

        this.container.style.setProperty('--sidebar-left-width', this.leftCollapsed ? '0px' : `${this.leftWidth}px`);
        this.container.style.setProperty('--sidebar-right-width', this.rightCollapsed ? '0px' : `${this.rightWidth}px`);

        this.setCollapsedState('left', this.leftCollapsed);
        this.setCollapsedState('right', this.rightCollapsed);
        this.updateActivityState();
    },

    setCollapsedState(side, collapsed) {
        const sidebars = side === 'left'
            ? [this.explorerSidebar, this.extensionsSidebar]
            : [this.rightSidebar];
        const resizer = side === 'left' ? this.leftResizer : this.rightResizer;

        sidebars.forEach((sidebar) => {
            if (sidebar) {
                sidebar.classList.toggle('collapsed', collapsed);
            }
        });

        if (resizer) {
            resizer.classList.toggle('collapsed', collapsed);
        }
    },

    toggleSidebar(side, options = {}) {
        const { forceOpen = false } = options;

        if (side === 'left') {
            this.leftCollapsed = forceOpen ? false : !this.leftCollapsed;
        } else {
            this.rightCollapsed = forceOpen ? false : !this.rightCollapsed;
        }
        this.applyLayout();
        this.persistState();
    },

    updateActivityState() {
        if (this.activityExplorer) {
            this.activityExplorer.classList.toggle('active', !this.leftCollapsed && this.activeLeftView === 'explorer');
        }
        if (this.activityExtensions) {
            this.activityExtensions.classList.toggle('active', !this.leftCollapsed && this.activeLeftView === 'extensions');
        }
        if (this.activityAI) {
            this.activityAI.classList.toggle('active', !this.rightCollapsed);
        }
        if (this.activityAIRight) {
            this.activityAIRight.classList.toggle('active', !this.rightCollapsed);
        }
    },

    switchLeftView(view) {
        console.debug('[Layout] switchLeftView', {
            view,
            activeLeftView: this.activeLeftView,
            leftCollapsed: this.leftCollapsed,
            hasExplorer: Boolean(this.explorerSidebar),
            hasExtensions: Boolean(this.extensionsSidebar)
        });
        if (this.activeLeftView === view) {
            // If clicking the same view, just ensure it's visible
            if (this.leftCollapsed) {
                this.leftCollapsed = false;
                this.applyLayout();
                this.persistState();
            }
            return;
        }

        this.activeLeftView = view;
        this.leftCollapsed = false; // Ensure sidebar is open

        // Show/hide appropriate sidebar
        if (view === 'explorer') {
            this.explorerSidebar?.classList.remove('hidden');
            this.extensionsSidebar?.classList.add('hidden');
            this.leftSidebar = this.explorerSidebar || this.leftSidebar;
        } else if (view === 'extensions') {
            this.explorerSidebar?.classList.add('hidden');
            this.extensionsSidebar?.classList.remove('hidden');
            this.leftSidebar = this.extensionsSidebar || this.leftSidebar;
        }

        this.applyLayout();
        this.persistState();
    },

    startResize(event, side) {
        event.preventDefault();
        const startX = event.clientX;
        const startLeft = this.leftWidth;
        const startRight = this.rightWidth;

        const onMove = (moveEvent) => {
            const delta = moveEvent.clientX - startX;
            if (side === 'left') {
                this.leftWidth = startLeft + delta;
                this.leftCollapsed = false;
            } else {
                this.rightWidth = startRight - delta;
                this.rightCollapsed = false;
            }
            this.applyLayout();
        };

        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            this.persistState();
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    }
};

window.Layout = Layout;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        Layout.init();
    });
} else {
    Layout.init();
}

export default Layout;
