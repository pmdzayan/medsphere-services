"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicEndpoint = exports.PUBLIC_ENDPOINT_METADATA = void 0;
const common_1 = require("@nestjs/common");
exports.PUBLIC_ENDPOINT_METADATA = 'medsphere:public-endpoint';
const PublicEndpoint = () => (0, common_1.SetMetadata)(exports.PUBLIC_ENDPOINT_METADATA, true);
exports.PublicEndpoint = PublicEndpoint;
//# sourceMappingURL=public-endpoint.decorator.js.map