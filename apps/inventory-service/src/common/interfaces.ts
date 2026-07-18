/**
 * OCR Service Interface
 *
 * Future implementations will integrate with OCR providers (e.g., Google Vision,
 * Tesseract, AWS Textract) to extract medicine information from prescription
 * images, medicine packaging, and labels.
 */
export interface OcrService {
  /**
   * Extract text from an image buffer.
   * @param imageBuffer - Raw image data
   * @param options - Optional processing hints
   * @returns Extracted text content
   */
  extractText(imageBuffer: Buffer, options?: Record<string, unknown>): Promise<string>;

  /**
   * Extract structured medicine information from a prescription image.
   * @param imageBuffer - Prescription image data
   * @returns Structured medicine data
   */
  extractPrescriptionData(imageBuffer: Buffer): Promise<PrescriptionOcrResult>;

  /**
   * Extract batch/label information from a medicine package image.
   * @param imageBuffer - Package image data
   * @returns Structured batch data
   */
  extractLabelData(imageBuffer: Buffer): Promise<LabelOcrResult>;
}

export interface PrescriptionOcrResult {
  patientName?: string;
  date?: string;
  medicines: Array<{
    name?: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
    notes?: string;
  }>;
  doctorName?: string;
  rawText: string;
  confidence: number;
}

export interface LabelOcrResult {
  productName?: string;
  batchNumber?: string;
  manufacturingDate?: string;
  expiryDate?: string;
  mrp?: string;
  manufacturer?: string;
  rawText: string;
  confidence: number;
}

/**
 * Inventory Intelligence Analysis Result
 */
export interface InventoryIntelligenceResult {
  productId: string;
  productName: string;
  sku?: string | null;
  currentQuantity: number;
  minimumStockLevel: number;
  health: string;
  turnoverRate?: number;
  daysUntilOutOfStock?: number;
  recommendation?: string;
}

export interface DashboardSummary {
  totalProducts: number;
  totalBatches: number;
  inventoryValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  expiringSoonCount: number;
  expiredCount: number;
}
