import os

base = os.getcwd()

# Fix spec file - remove unused 'result' variable
spec_path = os.path.join(base, 'apps/document-management-service/src/document/document.service.spec.ts')
with open(spec_path, 'r') as f:
    content = f.read()
content = content.replace(
    "const result = await service.listDocuments('tenant-1', { patientId: 'patient-1' })",
    "await service.listDocuments('tenant-1', { patientId: 'patient-1' })"
)
with open(spec_path, 'w') as f:
    f.write(content)
print('Spec file fixed')

# Fix service file - prefix unused parameter with _
service_path = os.path.join(base, 'apps/document-management-service/src/document/document.service.ts')
with open(service_path, 'r') as f:
    content = f.read()
old = "  async generatePresignedUploadUrl(\n    dto: GeneratePresignedUploadUrlDto,\n    requestMetadata?: { ipAddress?: string; userAgent?: string; correlationId?: string },\n  ) {"
new = "  async generatePresignedUploadUrl(\n    dto: GeneratePresignedUploadUrlDto,\n    _requestMetadata?: { ipAddress?: string; userAgent?: string; correlationId?: string },\n  ) {"
content = content.replace(old, new)
with open(service_path, 'w') as f:
    f.write(content)
print('Service file fixed')

# Fix controller file - make headers parameter optional
controller_path = os.path.join(base, 'apps/document-management-service/src/document/document.controller.ts')
with open(controller_path, 'r') as f:
    content = f.read()
old = "    @Query('expiresInSeconds') expiresInSeconds?: string,\n    @Headers() headers: Record<string, string | undefined>,\n  ) {\n    const dto = new GeneratePresignedDownloadUrlDto();"
new = "    @Query('expiresInSeconds') expiresInSeconds?: string,\n    @Headers() headers?: Record<string, string | undefined>,\n  ) {\n    const dto = new GeneratePresignedDownloadUrlDto();"
content = content.replace(old, new)
with open(controller_path, 'w') as f:
    f.write(content)
print('Controller file fixed')

# Fix repository file - cast signatureData
repo_path = os.path.join(base, 'apps/document-management-service/src/document/document.repository.ts')
with open(repo_path, 'r') as f:
    content = f.read()
old = "        isSigned: true,\n        signatureData,"
new = "        isSigned: true,\n        signatureData: signatureData as never,"
content = content.replace(old, new)
with open(repo_path, 'w') as f:
    f.write(content)
print('Repository file fixed')
