-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'STAFF') NOT NULL DEFAULT 'STAFF',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgreementTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `bodyHtml` MEDIUMTEXT NOT NULL,
    `version` INTEGER NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AgreementTemplate_name_version_key`(`name`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Agreement` (
    `id` VARCHAR(191) NOT NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerPhone` VARCHAR(191) NOT NULL,
    `customerEmail` VARCHAR(191) NULL,
    `packageType` ENUM('VISA', 'TRAVEL', 'BOTH') NOT NULL,
    `destination` VARCHAR(191) NOT NULL,
    `price` DECIMAL(12, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `notes` TEXT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `templateVersion` INTEGER NOT NULL,
    `consentTextVersion` VARCHAR(191) NULL,
    `status` ENUM('DRAFT', 'SENT', 'OPENED', 'VERIFIED', 'SIGNED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `signingTokenHash` VARCHAR(191) NULL,
    `tokenExpiresAt` DATETIME(3) NULL,
    `originalPdfKey` VARCHAR(191) NULL,
    `originalPdfSha256` VARCHAR(191) NULL,
    `signedPdfKey` VARCHAR(191) NULL,
    `signedPdfSha256` VARCHAR(191) NULL,
    `videoKey` VARCHAR(191) NULL,
    `videoSha256` VARCHAR(191) NULL,
    `videoMimeType` VARCHAR(191) NULL,
    `videoDurationSec` DOUBLE NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `signedAt` DATETIME(3) NULL,
    `retentionDueAt` DATETIME(3) NULL,
    `purgedAt` DATETIME(3) NULL,
    `purgedById` VARCHAR(191) NULL,

    UNIQUE INDEX `Agreement_signingTokenHash_key`(`signingTokenHash`),
    INDEX `Agreement_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `Agreement_customerPhone_idx`(`customerPhone`),
    INDEX `Agreement_retentionDueAt_idx`(`retentionDueAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OtpChallenge` (
    `id` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NOT NULL,
    `codeHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OtpChallenge_agreementId_createdAt_idx`(`agreementId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditEvent` (
    `id` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `ip` VARCHAR(191) NULL,
    `userAgent` VARCHAR(512) NULL,
    `deviceInfo` JSON NULL,
    `metadata` JSON NULL,
    `prevHash` VARCHAR(191) NOT NULL,
    `hash` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AuditEvent_hash_key`(`hash`),
    UNIQUE INDEX `AuditEvent_agreementId_seq_key`(`agreementId`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccessLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `ip` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AccessLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Agreement` ADD CONSTRAINT `Agreement_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `AgreementTemplate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Agreement` ADD CONSTRAINT `Agreement_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OtpChallenge` ADD CONSTRAINT `OtpChallenge_agreementId_fkey` FOREIGN KEY (`agreementId`) REFERENCES `Agreement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditEvent` ADD CONSTRAINT `AuditEvent_agreementId_fkey` FOREIGN KEY (`agreementId`) REFERENCES `Agreement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccessLog` ADD CONSTRAINT `AccessLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccessLog` ADD CONSTRAINT `AccessLog_agreementId_fkey` FOREIGN KEY (`agreementId`) REFERENCES `Agreement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

