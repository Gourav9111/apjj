import { db } from "./db";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcrypt";
import {
  users,
  loanApplications,
  dsaPartners,
  leads,
  contactQueries,
  type User,
  type InsertUser,
  type LoanApplication,
  type InsertLoanApplication,
  type DsaPartner,
  type InsertDsaPartner,
  type Lead,
  type InsertLead,
  type ContactQuery,
  type InsertContactQuery
} from "@shared/schema";
import type { IStorage } from "./storage";

export class DatabaseStorage implements IStorage {
  constructor() {
    this.initializeDefaultUsers();
  }

  private async initializeDefaultUsers() {
    try {
      // Check if admin user already exists
      const existingAdmin = await db.select().from(users).where(eq(users.username, "admin")).limit(1);
      
      if (existingAdmin.length === 0) {
        // Create default admin user
        const hashedPassword = await bcrypt.hash("admin123", 10);
        await db.insert(users).values({
          username: "admin",
          email: "admin@jsmf.com",
          password: hashedPassword,
          role: "admin",
          fullName: "System Administrator",
          mobileNumber: "+91 91626 207918",
          city: "Bhopal",
          isActive: true,
        });
        console.log("Default admin user created");
      }
    } catch (error) {
      console.error("Error initializing default users:", error);
    }
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);
    const result = await db.insert(users).values({
      ...insertUser,
      password: hashedPassword,
      role: insertUser.role || "user",
      isActive: true,
    }).returning();
    return result[0];
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const result = await db.update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error("User not found");
    }
    return result[0];
  }

  async authenticateUser(username: string, password: string): Promise<User | null> {
    const user = await this.getUserByUsername(username);
    if (!user) return null;
    
    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  // Loan application operations
  async createLoanApplication(application: InsertLoanApplication & { userId: string }): Promise<LoanApplication> {
    const result = await db.insert(loanApplications).values({
      ...application,
      status: "pending",
    }).returning();
    return result[0];
  }

  async getLoanApplications(): Promise<LoanApplication[]> {
    return await db.select().from(loanApplications);
  }

  async getLoanApplicationsByUser(userId: string): Promise<LoanApplication[]> {
    return await db.select().from(loanApplications).where(eq(loanApplications.userId, userId));
  }

  async getLoanApplicationsByDsa(dsaId: string): Promise<LoanApplication[]> {
    return await db.select().from(loanApplications).where(eq(loanApplications.assignedDsaId, dsaId));
  }

  async updateLoanApplication(id: string, updates: Partial<LoanApplication>): Promise<LoanApplication> {
    const result = await db.update(loanApplications)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(loanApplications.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error("Application not found");
    }
    return result[0];
  }

  // DSA partner operations
  async createDsaPartner(partner: InsertDsaPartner & { userId: string }): Promise<DsaPartner> {
    const result = await db.insert(dsaPartners).values({
      ...partner,
      kycStatus: "pending",
    }).returning();
    return result[0];
  }

  async getDsaPartners(): Promise<DsaPartner[]> {
    return await db.select().from(dsaPartners);
  }

  async getDsaPartnerByUserId(userId: string): Promise<DsaPartner | undefined> {
    const result = await db.select().from(dsaPartners).where(eq(dsaPartners.userId, userId)).limit(1);
    return result[0];
  }

  async updateDsaPartner(id: string, updates: Partial<DsaPartner>): Promise<DsaPartner> {
    const result = await db.update(dsaPartners)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(dsaPartners.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error("DSA partner not found");
    }
    return result[0];
  }

  // Lead operations
  async createLead(lead: InsertLead): Promise<Lead> {
    const result = await db.insert(leads).values({
      ...lead,
      source: lead.source || "website",
      status: "new",
    }).returning();
    return result[0];
  }

  async getLeads(): Promise<Lead[]> {
    return await db.select().from(leads);
  }

  async getLeadsByDsa(dsaId: string): Promise<Lead[]> {
    return await db.select().from(leads).where(eq(leads.assignedDsaId, dsaId));
  }

  async assignLeadToDsa(leadId: string, dsaId: string): Promise<Lead> {
    const result = await db.update(leads)
      .set({ 
        assignedDsaId: dsaId, 
        assignedAt: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(leads.id, leadId))
      .returning();
    
    if (result.length === 0) {
      throw new Error("Lead not found");
    }
    return result[0];
  }

  async updateLead(id: string, updates: Partial<Lead>): Promise<Lead> {
    const result = await db.update(leads)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(leads.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error("Lead not found");
    }
    return result[0];
  }

  // Contact query operations
  async createContactQuery(query: InsertContactQuery): Promise<ContactQuery> {
    const result = await db.insert(contactQueries).values({
      ...query,
      status: "new",
    }).returning();
    return result[0];
  }

  async getContactQueries(): Promise<ContactQuery[]> {
    return await db.select().from(contactQueries);
  }

  async updateContactQuery(id: string, updates: Partial<ContactQuery>): Promise<ContactQuery> {
    const result = await db.update(contactQueries)
      .set(updates)
      .where(eq(contactQueries.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error("Contact query not found");
    }
    return result[0];
  }
}

export const dbStorage = new DatabaseStorage();