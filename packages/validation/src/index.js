"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createValidationPipe = createValidationPipe;
const common_1 = require("@nestjs/common");
function createValidationPipe(options = {}) {
    return new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        ...options,
    });
}
//# sourceMappingURL=index.js.map