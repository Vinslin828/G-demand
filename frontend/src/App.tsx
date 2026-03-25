import axios from "axios";
import {
  BarChart3,
  Database,
  CircleCheck,
  ChevronDown,
  LayoutGrid,
  Layers3,
  Link2,
  LogOut,
  RefreshCw,
  SlidersHorizontal,
  User
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useMessageContext } from "./context/MessageContext";

type HealthResponse = {
  status: string;
  service: string;
};

type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
};

type OrgNode = {
  id: string;
  name: string;
  code: string;
  bus?: Array<{
    id: string;
    name: string;
    code: string;
    companies: Array<{
      id: string;
      name: string;
      code: string;
      plants: Array<{ id: string; name: string; code: string }>;
      sales: Array<{ id: string; name: string; code: string; type: string }>;
    }>;
  }>;
};

type Role = {
  id: string;
  name: string;
  description?: string;
  permissions: Array<{ permission: { id: string; code: string } }>;
};

type Permission = {
  id: string;
  code: string;
};

type UserRecord = {
  id: string;
  email: string;
  displayName: string;
  roleAssignments: Array<{ role: { id: string; name: string } }>;
};

type Category = "admin" | "master-data" | "forecast-planning" | "adjustment" | "analysis" | "integration";
type AdminFunction = "organization" | "users-role" | "role-permissions";

const API_BASE = "http://localhost:4000";
const CATEGORY_LABELS: Record<Category, string> = {
  admin: "Admin",
  "master-data": "Master Data",
  "forecast-planning": "Forecast Planning",
  adjustment: "Adjustment",
  analysis: "Analysis",
  integration: "Integration"
};

const MODULE_FUNCTIONS: Record<Category, string[]> = {
  admin: ["Users & Role", "Role & Permissions", "Organization"],
  "master-data": ["Product Attributes", "Channel Attributes", "Forecast Origin", "Period Config", "Zero Handling"],
  "forecast-planning": ["Version Management", "Version Origin", "Template Generation", "Forecast Upload", "Forecast Grid"],
  adjustment: ["Allocation Rules", "Manager Adjustment", "Breakdown", "Adjustment Logs"],
  analysis: ["Pivot Analysis", "LTP vs Rolling", "Value Analysis", "Export"],
  integration: ["ERP Connector", "Field Mapping", "Manual Sync", "Sync History"]
};

function App() {
  const [token, setToken] = useState<string>("");
  const [email, setEmail] = useState("admin@g-demand.local");
  const [password, setPassword] = useState("ChangeMe123!");
  const [userName, setUserName] = useState<string>("");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [orgTree, setOrgTree] = useState<OrgNode[]>([]);
  const [busy, setBusy] = useState(false);
  const [groupCode, setGroupCode] = useState("GRP01");
  const [groupName, setGroupName] = useState("Global Group");
  const [buCode, setBuCode] = useState("BU01");
  const [buName, setBuName] = useState("Consumer BU");
  const [companyCode, setCompanyCode] = useState("COM01");
  const [companyName, setCompanyName] = useState("Sales Company A");
  const [companyType, setCompanyType] = useState<"SALES" | "MANUFACTURING">("SALES");
  const [plantCode, setPlantCode] = useState("PL01");
  const [plantName, setPlantName] = useState("Plant 01");
  const [salesCode, setSalesCode] = useState("S001");
  const [salesName, setSalesName] = useState("Sales Team 1");
  const [salesType, setSalesType] = useState<"TEAM" | "PERSON">("TEAM");
  const [activeCategory, setActiveCategory] = useState<Category>("admin");
  const [activeAdminFunction, setActiveAdminFunction] = useState<AdminFunction>("organization");
  const [activeModuleFunction, setActiveModuleFunction] = useState<string>(MODULE_FUNCTIONS["master-data"][0]);
  const [openCategoryMenu, setOpenCategoryMenu] = useState<Category | null>(null);
  const [contextGroupBU] = useState("Default Group / BU");
  const [contextForecast] = useState("Rolling Forecast");
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [newUserEmail, setNewUserEmail] = useState("planner@g-demand.local");
  const [newUserName, setNewUserName] = useState("Planner User");
  const [newUserPassword, setNewUserPassword] = useState("ChangeMe123!");
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRoleId, setAssignRoleId] = useState("");
  const [newRoleName, setNewRoleName] = useState("forecast_manager");
  const [newRoleDescription, setNewRoleDescription] = useState("Can manage forecast setup and activation");
  const [selectedPermissionCodes, setSelectedPermissionCodes] = useState<string[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedBuId, setSelectedBuId] = useState("");
  const [selectedCompanyIdForPlant, setSelectedCompanyIdForPlant] = useState("");
  const [selectedCompanyIdForSales, setSelectedCompanyIdForSales] = useState("");
  const { showMessage } = useMessageContext();

  const authedApi = useMemo(
    () =>
      axios.create({
        baseURL: API_BASE,
        headers: { Authorization: `Bearer ${token}` }
      }),
    [token]
  );

  const checkBackend = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get<HealthResponse>(`${API_BASE}/health`);
      setHealth(data);
      showMessage("Backend is reachable.");
    } catch {
      showMessage("Unable to reach backend. Start backend on port 4000.");
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post<LoginResponse>(`${API_BASE}/auth/login`, { email, password });
      setToken(data.token);
      setUserName(data.user.displayName);
      showMessage("Signed in.");
      setTimeout(() => {
        void loadOrgTree();
        void loadRoles();
        void loadPermissions();
        void loadUsers();
      }, 0);
    } catch {
      showMessage("Login failed. Check email/password.");
    } finally {
      setBusy(false);
    }
  };

  const loadOrgTree = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const { data } = await authedApi.get<OrgNode[]>("/setup/org-tree");
      setOrgTree(data);
    } catch {
      showMessage("Failed to load organization tree.");
    } finally {
      setBusy(false);
    }
  };

  const loadRoles = async () => {
    if (!token) return;
    try {
      const { data } = await authedApi.get<Role[]>("/setup/roles");
      setRoles(data);
    } catch {
      showMessage("Failed to load roles.");
    }
  };

  const loadPermissions = async () => {
    if (!token) return;
    try {
      const { data } = await authedApi.get<Permission[]>("/setup/permissions");
      setPermissions(data);
      if (selectedPermissionCodes.length === 0) {
        setSelectedPermissionCodes(data.slice(0, 4).map((p) => p.code));
      }
    } catch {
      showMessage("Failed to load permissions.");
    }
  };

  const loadUsers = async () => {
    if (!token) return;
    try {
      const { data } = await authedApi.get<UserRecord[]>("/setup/users");
      setUsers(data);
      if (!assignUserId && data[0]) setAssignUserId(data[0].id);
    } catch {
      showMessage("Failed to load users.");
    }
  };

  const createGroup = async () => {
    setBusy(true);
    try {
      await authedApi.post("/setup/groups", { code: groupCode, name: groupName });
      showMessage("Group created.");
      await loadOrgTree();
    } catch {
      showMessage("Unable to create group.");
    } finally {
      setBusy(false);
    }
  };

  const createBU = async () => {
    const groupId = selectedGroupId || orgTree[0]?.id;
    if (!groupId) {
      showMessage("Create at least one group first.");
      return;
    }
    setBusy(true);
    try {
      await authedApi.post("/setup/bus", { groupId, code: buCode, name: buName });
      showMessage("BU created.");
      await loadOrgTree();
    } catch {
      showMessage("Unable to create BU.");
    } finally {
      setBusy(false);
    }
  };

  const createCompany = async () => {
    const buId = selectedBuId || undefined;
    setBusy(true);
    try {
      await authedApi.post("/setup/companies", {
        ...(buId ? { buId } : {}),
        code: companyCode,
        name: companyName,
        type: companyType,
        timezone: "UTC"
      });
      showMessage("Company created.");
      await loadOrgTree();
    } catch {
      showMessage("Unable to create company.");
    } finally {
      setBusy(false);
    }
  };

  const createPlant = async () => {
    const allCompanies = orgTree.flatMap((g) => (g.bus ?? []).flatMap((bu) => bu.companies));
    const companyId = selectedCompanyIdForPlant || allCompanies[0]?.id;
    if (!companyId) {
      showMessage("Create a company first.");
      return;
    }
    setBusy(true);
    try {
      await authedApi.post("/setup/plants", {
        companyId,
        code: plantCode,
        name: plantName
      });
      showMessage("Plant created.");
      await loadOrgTree();
    } catch {
      showMessage("Unable to create plant.");
    } finally {
      setBusy(false);
    }
  };

  const createSales = async () => {
    const allCompanies = orgTree.flatMap((g) => (g.bus ?? []).flatMap((bu) => bu.companies));
    const companyId = selectedCompanyIdForSales || allCompanies[0]?.id;
    if (!companyId) {
      showMessage("Create a company first.");
      return;
    }
    setBusy(true);
    try {
      await authedApi.post("/setup/sales", {
        companyId,
        code: salesCode,
        name: salesName,
        type: salesType
      });
      showMessage("Sales created.");
      await loadOrgTree();
    } catch {
      showMessage("Unable to create sales.");
    } finally {
      setBusy(false);
    }
  };

  const createUser = async () => {
    setBusy(true);
    try {
      await authedApi.post("/setup/users", {
        email: newUserEmail,
        displayName: newUserName,
        password: newUserPassword
      });
      showMessage("User created.");
      await loadUsers();
    } catch {
      showMessage("Unable to create user.");
    } finally {
      setBusy(false);
    }
  };

  const createRole = async () => {
    setBusy(true);
    try {
      await authedApi.post("/setup/roles", {
        name: newRoleName,
        description: newRoleDescription,
        permissionCodes: selectedPermissionCodes
      });
      showMessage("Role created.");
      await loadRoles();
    } catch {
      showMessage("Unable to create role.");
    } finally {
      setBusy(false);
    }
  };

  const assignRole = async () => {
    if (!assignUserId || !assignRoleId) {
      showMessage("Select both user and role.");
      return;
    }
    setBusy(true);
    try {
      await authedApi.post("/setup/users/assign-role", {
        userId: assignUserId,
        roleId: assignRoleId
      });
      showMessage("Role assigned.");
      await loadUsers();
    } catch {
      showMessage("Unable to assign role.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    void loadOrgTree();
    void loadRoles();
    void loadPermissions();
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (activeCategory === "admin") {
      setOpenCategoryMenu(null);
      return;
    }
    setActiveModuleFunction(MODULE_FUNCTIONS[activeCategory][0]);
    setOpenCategoryMenu(null);
  }, [activeCategory]);

  if (!token) {
    return (
      <div className="page narrow">
        <header className="top-nav">
          <h1>G-Demand</h1>
          <p>Sign in to continue</p>
        </header>
        <section className="card">
          <h2>Admin Login</h2>
          <div className="form-grid">
            <label>
              Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button className="btn btn-primary" type="button" onClick={login} disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </section>
      </div>
    );
  }

  const renderAdminSection = () => {
    if (activeAdminFunction === "organization") {
      const allBus = orgTree.flatMap((g) => g.bus ?? []);
      const allCompanies = allBus.flatMap((bu) => bu.companies);

      return (
        <>
          {/* System Checks */}
          <section className="card span-2">
            <h2>System Checks</h2>
            <div className="inline-actions">
              <button className="btn btn-primary" type="button" onClick={checkBackend} disabled={loading}>
                {loading ? "Checking..." : "Check Backend Health"}
              </button>
              <button className="btn" type="button" onClick={loadOrgTree} disabled={busy}>
                <RefreshCw size={16} /> Reload Org Tree
              </button>
            </div>
            {health && (
              <p className="ok-row">
                <CircleCheck size={16} />
                <span>
                  {health.service}: {health.status}
                </span>
              </p>
            )}
          </section>

          {/* Group */}
          <section className="card">
            <div className="entity-header">
              <span className="org-badge org-badge-group">Group</span>
              <h2>Group</h2>
            </div>
            <p>Top-level entity. All BUs belong to a Group.</p>
            <div className="form-grid">
              <label>
                Code
                <input value={groupCode} onChange={(e) => setGroupCode(e.target.value)} />
              </label>
              <label>
                Name
                <input value={groupName} onChange={(e) => setGroupName(e.target.value)} />
              </label>
              <button className="btn btn-primary span-all" type="button" onClick={createGroup} disabled={busy}>
                Create Group
              </button>
            </div>
          </section>

          {/* BU */}
          <section className="card">
            <div className="entity-header">
              <span className="org-badge org-badge-bu">BU</span>
              <h2>Business Unit</h2>
            </div>
            <p>Owns long-term planning. Belongs to a Group.</p>
            <div className="form-grid">
              <label className="span-all">
                Parent Group
                <select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>
                  <option value="">— select group —</option>
                  {orgTree.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.code})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Code
                <input value={buCode} onChange={(e) => setBuCode(e.target.value)} />
              </label>
              <label>
                Name
                <input value={buName} onChange={(e) => setBuName(e.target.value)} />
              </label>
              <button className="btn btn-primary span-all" type="button" onClick={createBU} disabled={busy || orgTree.length === 0}>
                Create BU
              </button>
            </div>
          </section>

          {/* Company */}
          <section className="card">
            <div className="entity-header">
              <span className="org-badge org-badge-company">Company</span>
              <h2>Company</h2>
            </div>
            <p>Legal entity for rolling production. Optionally linked to a BU.</p>
            <div className="form-grid">
              <label className="span-all">
                Parent BU <span className="field-optional">(optional)</span>
                <select value={selectedBuId} onChange={(e) => setSelectedBuId(e.target.value)}>
                  <option value="">— none —</option>
                  {allBus.map((bu) => (
                    <option key={bu.id} value={bu.id}>
                      {bu.name} ({bu.code})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Code
                <input value={companyCode} onChange={(e) => setCompanyCode(e.target.value)} />
              </label>
              <label>
                Name
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </label>
              <label className="span-all">
                Type
                <select value={companyType} onChange={(e) => setCompanyType(e.target.value as "SALES" | "MANUFACTURING")}>
                  <option value="SALES">Sales</option>
                  <option value="MANUFACTURING">Manufacturing</option>
                </select>
              </label>
              <button className="btn btn-primary span-all" type="button" onClick={createCompany} disabled={busy}>
                Create Company
              </button>
            </div>
          </section>

          {/* Plant */}
          <section className="card">
            <div className="entity-header">
              <span className="org-badge org-badge-plant">Plant</span>
              <h2>Plant</h2>
            </div>
            <p>Optional. For manufacturing companies. Belongs to a Company.</p>
            <div className="form-grid">
              <label className="span-all">
                Parent Company
                <select value={selectedCompanyIdForPlant} onChange={(e) => setSelectedCompanyIdForPlant(e.target.value)}>
                  <option value="">— select company —</option>
                  {allCompanies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Code
                <input value={plantCode} onChange={(e) => setPlantCode(e.target.value)} />
              </label>
              <label>
                Name
                <input value={plantName} onChange={(e) => setPlantName(e.target.value)} />
              </label>
              <button className="btn btn-primary span-all" type="button" onClick={createPlant} disabled={busy || allCompanies.length === 0}>
                Create Plant
              </button>
            </div>
          </section>

          {/* Sales */}
          <section className="card">
            <div className="entity-header">
              <span className="org-badge org-badge-sales">Sales</span>
              <h2>Sales</h2>
            </div>
            <p>Person or team for rolling production. Belongs to a Company.</p>
            <div className="form-grid">
              <label className="span-all">
                Parent Company
                <select value={selectedCompanyIdForSales} onChange={(e) => setSelectedCompanyIdForSales(e.target.value)}>
                  <option value="">— select company —</option>
                  {allCompanies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Code
                <input value={salesCode} onChange={(e) => setSalesCode(e.target.value)} />
              </label>
              <label>
                Name
                <input value={salesName} onChange={(e) => setSalesName(e.target.value)} />
              </label>
              <label className="span-all">
                Type
                <select value={salesType} onChange={(e) => setSalesType(e.target.value as "TEAM" | "PERSON")}>
                  <option value="TEAM">Team</option>
                  <option value="PERSON">Person</option>
                </select>
              </label>
              <button className="btn btn-primary span-all" type="button" onClick={createSales} disabled={busy || allCompanies.length === 0}>
                Create Sales
              </button>
            </div>
          </section>

          {/* Org Tree */}
          <section className="card span-2">
            <h2>Organization Tree</h2>
            {orgTree.length === 0 ? (
              <p>No organizations yet. Create a Group to get started.</p>
            ) : (
              <div className="org-tree">
                {orgTree.map((group) => (
                  <div key={group.id} className="org-row org-level-0">
                    <span className="org-badge org-badge-group">Group</span>
                    <span className="org-node-name">{group.name}</span>
                    <span className="org-node-code">{group.code}</span>
                    {(group.bus ?? []).map((bu) => (
                      <div key={bu.id} className="org-row org-level-1">
                        <span className="org-badge org-badge-bu">BU</span>
                        <span className="org-node-name">{bu.name}</span>
                        <span className="org-node-code">{bu.code}</span>
                        {bu.companies.map((company) => (
                          <div key={company.id} className="org-row org-level-2">
                            <span className="org-badge org-badge-company">Company</span>
                            <span className="org-node-name">{company.name}</span>
                            <span className="org-node-code">{company.code}</span>
                            <span className="org-node-type">{company.type}</span>
                            {company.plants.map((plant) => (
                              <div key={plant.id} className="org-row org-level-3">
                                <span className="org-badge org-badge-plant">Plant</span>
                                <span className="org-node-name">{plant.name}</span>
                                <span className="org-node-code">{plant.code}</span>
                              </div>
                            ))}
                            {company.sales.map((s) => (
                              <div key={s.id} className="org-row org-level-3">
                                <span className="org-badge org-badge-sales">Sales</span>
                                <span className="org-node-name">{s.name}</span>
                                <span className="org-node-code">{s.code}</span>
                                <span className="org-node-type">{s.type}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      );
    }

    if (activeAdminFunction === "users-role") {
      return (
        <>
          <section className="card">
            <h2>Create User</h2>
            <div className="form-grid">
              <label>
                Email
                <input value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} />
              </label>
              <label>
                Display Name
                <input value={newUserName} onChange={(e) => setNewUserName(e.target.value)} />
              </label>
              <label>
                Password
                <input type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} />
              </label>
              <button className="btn btn-primary" type="button" onClick={createUser} disabled={busy}>
                Create User
              </button>
            </div>
          </section>
          <section className="card">
            <h2>Assign Role to User</h2>
            <div className="form-grid">
              <label>
                User
                <select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)}>
                  <option value="">Select user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName} ({user.email})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Role
                <select value={assignRoleId} onChange={(e) => setAssignRoleId(e.target.value)}>
                  <option value="">Select role</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn" type="button" onClick={assignRole} disabled={busy}>
                Assign Role
              </button>
            </div>
          </section>
          <section className="card span-2">
            <h2>Users</h2>
            <pre className="code-box">{JSON.stringify(users, null, 2)}</pre>
          </section>
        </>
      );
    }

    return (
      <>
        <section className="card">
          <h2>Create Role</h2>
          <div className="form-grid">
            <label>
              Role Name
              <input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} />
            </label>
            <label>
              Description
              <input value={newRoleDescription} onChange={(e) => setNewRoleDescription(e.target.value)} />
            </label>
            <label className="span-all">
              Permission Codes (comma separated)
              <input
                value={selectedPermissionCodes.join(",")}
                onChange={(e) =>
                  setSelectedPermissionCodes(
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
              />
            </label>
            <button className="btn btn-primary" type="button" onClick={createRole} disabled={busy}>
              Create Role
            </button>
          </div>
        </section>
        <section className="card span-2">
          <h2>Roles & Permissions</h2>
          <div className="inline-actions">
            <button className="btn" type="button" onClick={loadRoles}>
              Refresh Roles
            </button>
            <button className="btn" type="button" onClick={loadPermissions}>
              Refresh Permissions
            </button>
          </div>
          <pre className="code-box">{JSON.stringify({ roles, permissions }, null, 2)}</pre>
        </section>
      </>
    );
  };

  return (
    <div className="page">
      <header className="app-header">
        <div className="header-row">
          <div className="app-brand">
            <span className="brand-icon">
              <LayoutGrid size={14} />
            </span>
            <span className="brand-title">G-Demand</span>
          </div>
          <div className="header-user">
            <div>
              <div className="user-name">{userName}</div>
              <div className="user-role">ADMIN</div>
            </div>
            <span className="user-avatar">
              <User size={14} />
            </span>
            <button className="icon-btn" type="button" onClick={() => setToken("")} title="Sign out">
              <LogOut size={14} />
            </button>
          </div>
        </div>

        <div className="header-row">
          <nav className="header-main-nav">
            {(
              [
                ["master-data", <Database size={14} key="md" />],
                ["forecast-planning", <LayoutGrid size={14} key="fp" />],
                ["adjustment", <SlidersHorizontal size={14} key="adj" />],
                ["analysis", <BarChart3 size={14} key="ana" />],
                ["integration", <Link2 size={14} key="int" />],
                ["admin", <Layers3 size={14} key="adm" />]
              ] as Array<[Category, ReactElement]>
            ).map(([key, icon]) => (
              <div className="nav-item" key={key}>
                <button
                  className={activeCategory === key ? "main-nav-btn active" : "main-nav-btn"}
                  onClick={() => {
                    setOpenCategoryMenu((prev) => (prev === key ? null : key));
                  }}
                  type="button"
                >
                  {icon} {CATEGORY_LABELS[key]} <ChevronDown size={14} />
                </button>
                {openCategoryMenu === key && (
                  <div className="function-menu category-menu">
                    <div className="function-menu-title">{CATEGORY_LABELS[key]}</div>
                    {MODULE_FUNCTIONS[key].map((item) => (
                      <button
                        className="function-menu-item"
                        key={item}
                        onClick={() => {
                          setActiveCategory(key);
                          if (key === "admin") {
                            if (item === "Users & Role") setActiveAdminFunction("users-role");
                            else if (item === "Role & Permissions") setActiveAdminFunction("role-permissions");
                            else setActiveAdminFunction("organization");
                          } else {
                            setActiveModuleFunction(item);
                          }
                          setOpenCategoryMenu(null);
                        }}
                        type="button"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>
      </header>

      <main className="content-grid">
        {activeCategory !== "admin" && (
          <section className="card span-2">
            <h2>
              {CATEGORY_LABELS[activeCategory]} / {activeModuleFunction}
            </h2>
            <div className="header-context">
              <button className="ctx-btn" type="button">
                {contextGroupBU} <ChevronDown size={14} />
              </button>
              <button className="ctx-btn" type="button">
                {contextForecast} <ChevronDown size={14} />
              </button>
            </div>
            <p>This module function is planned and will be implemented in the next phase.</p>
          </section>
        )}
        {activeCategory === "admin" && renderAdminSection()}
      </main>
    </div>
  );
}

export default App;
