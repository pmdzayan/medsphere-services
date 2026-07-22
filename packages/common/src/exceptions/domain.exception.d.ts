export declare class DomainException extends Error {
    readonly code: string;
    readonly httpStatus: number;
    constructor(code: string, message: string, httpStatus?: number);
}
