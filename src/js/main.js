// Point d'entrée : chaque fichier est un module ES, donc ses variables (game, money...)
// ne sont plus accessibles depuis la console du navigateur.
import './state.js';
import {
    closeDeploymentModal, closeRepairModal, closeShopModal, confirmDeploySelectedDrills,
    craftRepairKit, craftRepairKitMax, onTurnstileSuccess, renderDeploymentGrid,
    renderRepairGrid, setPhaseDisplay, switchRepairTab, togglePhaseContent,
    toggleSelectAllCardDrills
} from './function.js';
import './passive.js';
import './event.js';
import { submitCaptchaToServer } from './backend.js';
import './button.js';
import './loop.js';

// Seules les fonctions appelées depuis le HTML (onclick/onchange) ou par Turnstile (data-callback)
// restent sur window. Elles ne font que des actions possibles en jouant normalement.
Object.assign(window, {
    closeDeploymentModal, closeRepairModal, closeShopModal, confirmDeploySelectedDrills,
    craftRepairKit, craftRepairKitMax, onTurnstileSuccess, renderDeploymentGrid,
    renderRepairGrid, setPhaseDisplay, submitCaptchaToServer, switchRepairTab,
    togglePhaseContent, toggleSelectAllCardDrills
});
