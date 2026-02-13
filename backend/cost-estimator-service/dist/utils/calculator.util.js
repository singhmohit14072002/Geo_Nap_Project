"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDetails = exports.buildSummary = exports.buildBreakdown = exports.calculateNetworkEgressCost = exports.calculateDatabaseCost = exports.calculateStorageCost = exports.calculateComputeCost = void 0;
const round2 = (value) => Number(value.toFixed(2));
const calculateComputeCost = (requirement, rates) => {
    const total = requirement.compute.reduce((sum, item) => {
        return sum + item.vCPU * rates.vcpuPerMonth * item.quantity;
    }, 0);
    return round2(total);
};
exports.calculateComputeCost = calculateComputeCost;
const calculateStorageCost = (requirement, rates) => {
    const total = requirement.compute.reduce((sum, item) => {
        return sum + item.storageGB * rates.storagePerGbPerMonth * item.quantity;
    }, 0);
    return round2(total);
};
exports.calculateStorageCost = calculateStorageCost;
const calculateDatabaseCost = (requirement, rates) => {
    const total = rates.databaseBasePerMonth +
        requirement.database.storageGB * rates.storagePerGbPerMonth;
    return round2(total);
};
exports.calculateDatabaseCost = calculateDatabaseCost;
const calculateNetworkEgressCost = (requirement, rates) => {
    const total = requirement.network.dataEgressGB * rates.egressPerGbPerMonth;
    return round2(total);
};
exports.calculateNetworkEgressCost = calculateNetworkEgressCost;
const buildBreakdown = (compute, storage, database, networkEgress) => {
    return {
        compute: round2(compute),
        storage: round2(storage),
        database: round2(database),
        backup: 0,
        networkEgress: round2(networkEgress),
        other: 0
    };
};
exports.buildBreakdown = buildBreakdown;
const buildSummary = (breakdown) => {
    const monthlyTotal = round2(breakdown.compute +
        breakdown.storage +
        breakdown.database +
        breakdown.backup +
        breakdown.networkEgress +
        breakdown.other);
    return {
        monthlyTotal,
        yearlyTotal: round2(monthlyTotal * 12),
        currency: "INR"
    };
};
exports.buildSummary = buildSummary;
const buildDetails = (requirement, rates) => {
    const computeDetails = requirement.compute.map((item, index) => {
        const monthlyCost = round2(item.vCPU * rates.vcpuPerMonth * item.quantity);
        return {
            serviceType: "compute",
            name: `Compute node ${index + 1} (${item.osType})`,
            sku: `${item.vCPU} vCPU / ${item.ramGB} GB RAM`,
            quantity: item.quantity,
            unitPrice: round2(item.vCPU * rates.vcpuPerMonth),
            monthlyCost
        };
    });
    const storageDetails = requirement.compute.map((item, index) => {
        const monthlyCost = round2(item.storageGB * rates.storagePerGbPerMonth * item.quantity);
        return {
            serviceType: "storage",
            name: `Attached block storage ${index + 1}`,
            sku: `${item.storageGB} GB`,
            quantity: item.quantity,
            unitPrice: round2(item.storageGB * rates.storagePerGbPerMonth),
            monthlyCost
        };
    });
    const databaseMonthlyCost = round2(rates.databaseBasePerMonth +
        requirement.database.storageGB * rates.storagePerGbPerMonth);
    const databaseDetail = {
        serviceType: "database",
        name: `Managed ${requirement.database.engine} database`,
        sku: requirement.database.ha ? "HA enabled" : "Single zone",
        quantity: 1,
        unitPrice: round2(rates.databaseBasePerMonth),
        monthlyCost: databaseMonthlyCost
    };
    const networkMonthlyCost = round2(requirement.network.dataEgressGB * rates.egressPerGbPerMonth);
    const networkDetail = {
        serviceType: "network-egress",
        name: "Data egress",
        sku: `${requirement.network.dataEgressGB} GB`,
        quantity: 1,
        unitPrice: round2(rates.egressPerGbPerMonth),
        monthlyCost: networkMonthlyCost
    };
    return [
        ...computeDetails,
        ...storageDetails,
        databaseDetail,
        networkDetail
    ];
};
exports.buildDetails = buildDetails;
