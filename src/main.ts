import { Controller } from "./controller.js";
import { buildUI } from "./ui.js";

const controller = new Controller(buildUI());
controller.bindEvents();
controller.init();
