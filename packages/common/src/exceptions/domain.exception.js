"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainException = void 0;
class DomainException extends Error {
    code;
    httpStatus;
    constructor(code, message, httpStatus = 400) {
        super(message);
        this.code = code;
        this.httpStatus = httpStatus;
        this.name = 'DomainException';
    }
}
exports.DomainException = DomainException;
//# sourceMappingURL=domain.exception.js.map