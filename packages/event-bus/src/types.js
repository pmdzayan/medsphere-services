"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVENT_HANDLER_METADATA = exports.OutboxStatus = void 0;
var OutboxStatus;
(function (OutboxStatus) {
    OutboxStatus["PENDING"] = "PENDING";
    OutboxStatus["PROCESSING"] = "PROCESSING";
    OutboxStatus["PUBLISHED"] = "PUBLISHED";
    OutboxStatus["FAILED"] = "FAILED";
})(OutboxStatus || (exports.OutboxStatus = OutboxStatus = {}));
exports.EVENT_HANDLER_METADATA = 'event_bus:handlers';
//# sourceMappingURL=types.js.map