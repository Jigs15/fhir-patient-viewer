import React, { useEffect, useMemo, useState } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  InputAdornment,
  Divider,
  Chip,
  Paper,
  Tabs,
  Tab,
  Stack,
  Card,
  CardContent,
  Avatar,
} from "@mui/material";

import DashboardIcon from "@mui/icons-material/Dashboard";
import PeopleIcon from "@mui/icons-material/People";
import EventIcon from "@mui/icons-material/Event";
import MedicationIcon from "@mui/icons-material/Medication";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import AssessmentIcon from "@mui/icons-material/Assessment";
import SearchIcon from "@mui/icons-material/Search";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";

const drawerWidth = 220;

export default function Home() {
  // global clinical data
  const [patients, setPatients] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [medications, setMedications] = useState([]);
  const [observations, setObservations] = useState([]);
  const [encounters, setEncounters] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // UI state
  const [currentView, setCurrentView] = useState("dashboard"); // "dashboard" | "search" | "detail" | "analytics"
  const [activeTab, setActiveTab] = useState("overview"); // for detail tabs
  const [selectedPatient, setSelectedPatient] = useState(null);

  // search (used in search view + detail patient list)
  const [search, setSearch] = useState("");

  // load all JSON files from /public/data
  useEffect(() => {
    async function loadAll() {
      try {
        const [pRes, cRes, mRes, oRes, eRes] = await Promise.all([
          fetch("/data/patients.json"),
          fetch("/data/conditions.json"),
          fetch("/data/medications.json"),
          fetch("/data/observations.json"),
          fetch("/data/encounters.json"),
        ]);

        if (!pRes.ok || !cRes.ok || !mRes.ok || !oRes.ok || !eRes.ok) {
          throw new Error("One or more data files could not be loaded.");
        }

        const [pData, cData, mData, oData, eData] = await Promise.all([
          pRes.json(),
          cRes.json(),
          mRes.json(),
          oRes.json(),
          eRes.json(),
        ]);

        setPatients(pData);
        setConditions(cData);
        setMedications(mData);
        setObservations(oData);
        setEncounters(eData);

        if (pData.length > 0) {
          setSelectedPatient(pData[0]);
        }
      } catch (err) {
        console.error(err);
        setError("Could not load clinical data. Please try again later.");
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, []);

  /** ---------- per-patient derived data ---------- */

  const patientData = useMemo(() => {
    if (!selectedPatient) {
      return {
        patientConditions: [],
        patientChronicConditions: [],
        patientMeds: [],
        patientActiveMeds: [],
        patientObs: [],
        patientEncounters: [],
      };
    }
    const pid = selectedPatient.patient_id;
    const pc = conditions.filter((c) => c.patient_id === pid);
    const chronic = pc.filter((c) => c.chronic_flag === 1);
    const meds = medications.filter((m) => m.patient_id === pid);
    const activeMeds = meds.filter((m) => m.active_flag === 1);
    const obs = observations.filter((o) => o.patient_id === pid);
    const enc = encounters.filter((e) => e.patient_id === pid);

    return {
      patientConditions: pc,
      patientChronicConditions: chronic,
      patientMeds: meds,
      patientActiveMeds: activeMeds,
      patientObs: obs,
      patientEncounters: enc,
    };
  }, [selectedPatient, conditions, medications, observations, encounters]);

  const {
    patientConditions,
    patientChronicConditions,
    patientMeds,
    patientActiveMeds,
    patientObs,
    patientEncounters,
  } = patientData;

  // helper: get latest observation by type
  function getLatestObservation(type) {
    const subset = patientObs
      .filter((o) => o.observation_type === type)
      .sort(
        (a, b) =>
          new Date(b.observation_date).getTime() -
          new Date(a.observation_date).getTime()
      );
    return subset[0] || null;
  }

  // BP trend chart
  const bpTrend = useMemo(() => {
    const sbp = patientObs.filter((o) => o.observation_type === "Systolic BP");
    const dbp = patientObs.filter((o) => o.observation_type === "Diastolic BP");
    const mapByDate = new Map();
    sbp.forEach((s) => {
      mapByDate.set(s.observation_date, {
        date: s.observation_date,
        sbp: s.value,
      });
    });
    dbp.forEach((d) => {
      const existing = mapByDate.get(d.observation_date) || {
        date: d.observation_date,
      };
      existing.dbp = d.value;
      mapByDate.set(d.observation_date, existing);
    });
    return Array.from(mapByDate.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [patientObs]);

  const numChronic = patientChronicConditions.length;
  const numActiveMeds = patientActiveMeds.length;
  const numEncounters = patientEncounters.length;

  const latestSbp = getLatestObservation("Systolic BP");
  const latestDbp = getLatestObservation("Diastolic BP");
  const latestHba1c = getLatestObservation("HbA1c");

  /** ---------- simple risk score for badge ---------- */

  const riskInfo = useMemo(() => {
    if (!selectedPatient) return null;

    let score = 0;

    if (numChronic >= 3) score += 2;
    else if (numChronic >= 1) score += 1;

    if (latestHba1c) {
      if (latestHba1c.value >= 8.0) score += 2;
      else if (latestHba1c.value >= 7.0) score += 1;
    }

    if (latestSbp && latestDbp) {
      if (latestSbp.value >= 160 || latestDbp.value >= 100) score += 2;
      else if (latestSbp.value >= 140 || latestDbp.value >= 90) score += 1;
    }

    if (score >= 4)
      return { label: "High risk", color: "#C62828", variant: "filled" };
    if (score >= 2)
      return { label: "Medium risk", color: "#F9A825", variant: "filled" };
    return { label: "Low risk", color: "#2E7D32", variant: "outlined" };
  }, [selectedPatient, numChronic, latestHba1c, latestSbp, latestDbp]);

  /** ---------- search view suggestions ---------- */

  const searchResults = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (term.length === 0) return [];
    return patients.filter((p) =>
      `${p.first_name} ${p.last_name} ${p.patient_id}`
        .toLowerCase()
        .includes(term)
    );
  }, [patients, search]);

  /** ---------- analytics data ---------- */

  const patientsByCity = useMemo(() => {
    const map = new Map();
    patients.forEach((p) => {
      map.set(p.city, (map.get(p.city) || 0) + 1);
    });
    return Array.from(map.entries()).map(([city, count]) => ({
      city,
      count,
    }));
  }, [patients]);

  const patientsByPrimaryCondition = useMemo(() => {
    const map = new Map();
    patients.forEach((p) => {
      const key = p.primary_condition_name;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([condition, count]) => ({ condition, count }))
      .slice(0, 8);
  }, [patients]);

  const encountersByType = useMemo(() => {
    const map = new Map();
    encounters.forEach((e) => {
      map.set(e.encounter_type, (map.get(e.encounter_type) || 0) + 1);
    });
    return Array.from(map.entries()).map(([type, count]) => ({
      type,
      count,
    }));
  }, [encounters]);

  const handleTabChange = (_e, value) => setActiveTab(value);

  /** ---------- layout ---------- */

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      {/* SIDEBAR */}
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
            bgcolor: "#002D62",
            color: "white",
            borderRight: "none",
          },
        }}
      >
        <Toolbar
          sx={{
            bgcolor: "#004B8D",
            color: "white",
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <LocalHospitalIcon />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              FHIR Viewer
            </Typography>
          </Stack>
        </Toolbar>
        <Divider sx={{ borderColor: "rgba(255,255,255,0.12)" }} />
        <List dense>
          <SidebarItem
            icon={<DashboardIcon />}
            label="Dashboard"
            selected={currentView === "dashboard"}
            onClick={() => setCurrentView("dashboard")}
          />
          <SidebarItem
            icon={<PeopleIcon />}
            label="Search Patients"
            selected={currentView === "search"}
            onClick={() => {
              setCurrentView("search");
              setSearch("");
            }}
          />
          <SidebarItem
            icon={<EventIcon />}
            label="Encounters"
            selected={currentView === "detail" && activeTab === "encounters"}
            onClick={() => {
              setCurrentView("detail");
              setActiveTab("encounters");
            }}
          />
          <SidebarItem
            icon={<MedicationIcon />}
            label="Medications"
            selected={currentView === "detail" && activeTab === "meds"}
            onClick={() => {
              setCurrentView("detail");
              setActiveTab("meds");
            }}
          />
          <SidebarItem
            icon={<MonitorHeartIcon />}
            label="Vitals & Labs"
            selected={currentView === "detail" && activeTab === "vitals"}
            onClick={() => {
              setCurrentView("detail");
              setActiveTab("vitals");
            }}
          />
          <SidebarItem
            icon={<AssessmentIcon />}
            label="Analytics"
            selected={currentView === "analytics"}
            onClick={() => setCurrentView("analytics")}
          />
        </List>
      </Drawer>

      {/* MAIN AREA */}
      <Box
  component="main"
  sx={{
    flexGrow: 1,
    display: "flex",
    flexDirection: "column",
  }}
>

        {/* HEADER */}
        <AppBar
          position="static"
          elevation={0}
          sx={{
            bgcolor: "#004B8D",
            color: "white",
          }}
        >
          <Toolbar
            sx={{
              minHeight: 70,
              display: "flex",
              justifyContent: "space-between",
              gap: 2,
            }}
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {currentView === "dashboard"
                    ? "FHIR Patient Viewer – Dashboard"
                    : currentView === "search"
                    ? "Search Patients"
                    : currentView === "analytics"
                    ? "Cohort Analytics"
                    : selectedPatient
                    ? `${selectedPatient.first_name} ${selectedPatient.last_name}`
                    : "Select a patient"}
                </Typography>
                {currentView === "detail" && riskInfo && (
                  <Chip
                    label={riskInfo.label}
                    size="small"
                    sx={{
                      bgcolor:
                        riskInfo.variant === "filled"
                          ? riskInfo.color
                          : "transparent",
                      borderColor:
                        riskInfo.variant === "outlined"
                          ? riskInfo.color
                          : "transparent",
                      borderWidth: 1,
                      borderStyle: riskInfo.variant === "outlined" ? "solid" : "none",
                      color:
                        riskInfo.variant === "filled" ? "white" : riskInfo.color,
                      fontWeight: 600,
                    }}
                  />
                )}
              </Stack>

              {currentView === "detail" && selectedPatient && (
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  ID: {selectedPatient.patient_id} • {selectedPatient.gender} • Age{" "}
                  {selectedPatient.age} • DOB: {selectedPatient.birth_date}
                </Typography>
              )}

              {currentView !== "detail" && (
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  Synthetic FHIR-like cohort built for my Health Informatics portfolio.
                </Typography>
              )}
            </Box>

            <Box sx={{ textAlign: "right" }}>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                Health Informatics Portfolio – Jigneshkumar Patel
              </Typography>
              <Typography variant="caption" sx={{ display: "block", opacity: 0.8 }}>
                {patients.length} patients • {conditions.length} conditions •{" "}
                {medications.length} meds • {encounters.length} encounters
              </Typography>
            </Box>
          </Toolbar>
        </AppBar>

        {/* VIEW SWITCH */}
        {currentView === "dashboard" && (
          <Box sx={{ p: 2, flex: 1, overflow: "auto" }}>
            <DashboardView
              patients={patients}
              conditions={conditions}
              medications={medications}
              encounters={encounters}
              loading={loading}
              error={error}
            />
          </Box>
        )}

        {currentView === "search" && (
          <Box sx={{ p: 2, flex: 1, overflow: "auto" }}>
            <PatientSearchView
              search={search}
              setSearch={setSearch}
              results={searchResults}
              onSelectPatient={(p) => {
                setSelectedPatient(p);
                setCurrentView("detail");
                setActiveTab("overview");
              }}
              loading={loading}
              error={error}
            />
          </Box>
        )}

        {currentView === "analytics" && (
          <Box sx={{ p: 2, flex: 1, overflow: "auto" }}>
            <AnalyticsView
              patientsByCity={patientsByCity}
              patientsByPrimaryCondition={patientsByPrimaryCondition}
              encountersByType={encountersByType}
              loading={loading}
              error={error}
            />
          </Box>
        )}

        {currentView === "detail" && (
  <Box
    sx={{
      display: "flex",
      flex: 1,
      minHeight: 0,
      // no extra strip between drawer and content
      pl: 0,
      pr: 2,
      pt: 2,
      pb: 2,
      gap: 2,
    }}
  >
            {/* LEFT PANEL: patient list */}
           <Paper
  elevation={2}
  sx={{
    width: 320,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    // so it visually connects to the blue sidebar
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  }}
>
              <Box sx={{ p: 1.5, borderBottom: "1px solid #e0e0e0" }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  Patients
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Search by name or ID"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
              <Box sx={{ flex: 1, overflowY: "auto" }}>
                {loading && (
                  <Typography variant="body2" sx={{ p: 1.5 }}>
                    Loading patient cohort…
                  </Typography>
                )}
                {error && !loading && (
                  <Typography variant="body2" color="error" sx={{ p: 1.5 }}>
                    {error}
                  </Typography>
                )}
                {!loading &&
                  !error &&
                  patients
                    .filter((p) =>
                      `${p.first_name} ${p.last_name} ${p.patient_id}`
                        .toLowerCase()
                        .includes(search.toLowerCase())
                    )
                    .map((p) => {
                      const isSelected =
                        selectedPatient &&
                        selectedPatient.patient_id === p.patient_id;
                      return (
                        <ListItemButton
                          key={p.patient_id}
                          onClick={() => {
                            setSelectedPatient(p);
                            setActiveTab("overview");
                          }}
                          selected={isSelected}
                          sx={{
                            alignItems: "flex-start",
                            "&.Mui-selected": {
                              bgcolor: "rgba(25,118,210,0.12)",
                            },
                          }}
                        >
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {p.first_name} {p.last_name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              ID: {p.patient_id} • {p.gender} • Age {p.age}
                            </Typography>
                          </Box>
                          <Chip
                            label={p.city}
                            size="small"
                            sx={{ ml: 1 }}
                            variant="outlined"
                          />
                        </ListItemButton>
                      );
                    })}
              </Box>
            </Paper>

            {/* RIGHT PANEL: detail tabs */}
            <Paper
              elevation={2}
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
              }}
            >
              {/* summary chips */}
              {selectedPatient && !loading && !error && (
                <Box sx={{ p: 1.5, borderBottom: "1px solid #eee" }}>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <SummaryChip label="Chronic conditions" value={numChronic} />
                    <SummaryChip label="Active medications" value={numActiveMeds} />
                    <SummaryChip label="Encounters" value={numEncounters} />
                    {latestSbp && latestDbp && (
                      <SummaryChip
                        label="Most recent BP"
                        value={`${latestSbp.value}/${latestDbp.value} mmHg`}
                      />
                    )}
                    {latestHba1c && (
                      <SummaryChip
                        label="Latest HbA1c"
                        value={`${latestHba1c.value}%`}
                      />
                    )}
                  </Stack>
                </Box>
              )}

              {/* tabs */}
              <Tabs
                value={activeTab}
                onChange={handleTabChange}
                textColor="primary"
                indicatorColor="primary"
                variant="scrollable"
                scrollButtons="auto"
                sx={{
                  borderBottom: "1px solid #eee",
                  px: 1.5,
                }}
              >
                <Tab label="Overview" value="overview" />
                <Tab label="Conditions" value="conditions" />
                <Tab label="Medications" value="meds" />
                <Tab label="Vitals & Labs" value="vitals" />
                <Tab label="Encounters" value="encounters" />
              </Tabs>

              {/* tab content */}
              <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
                {error && (
                  <Typography color="error" variant="body2">
                    {error}
                  </Typography>
                )}

                {!error && !selectedPatient && !loading && (
                  <Typography variant="body2">
                    Select a patient from the left panel to view details.
                  </Typography>
                )}

                {!error && selectedPatient && activeTab === "overview" && (
                  <OverviewTab
                    patient={selectedPatient}
                    latestSbp={latestSbp}
                    latestDbp={latestDbp}
                    latestHba1c={latestHba1c}
                    bpTrend={bpTrend}
                  />
                )}

                {!error && selectedPatient && activeTab === "conditions" && (
                  <ConditionsTab
                    patientConditions={patientConditions}
                    patientChronicConditions={patientChronicConditions}
                  />
                )}

                {!error && selectedPatient && activeTab === "meds" && (
                  <MedicationsTab
                    patientMeds={patientMeds}
                    patientActiveMeds={patientActiveMeds}
                  />
                )}

                {!error && selectedPatient && activeTab === "vitals" && (
                  <VitalsTab
                    patientObs={patientObs}
                    getLatestObservation={getLatestObservation}
                    bpTrend={bpTrend}
                  />
                )}

                {!error && selectedPatient && activeTab === "encounters" && (
                  <EncountersTab patientEncounters={patientEncounters} />
                )}

                {loading && (
                  <Typography variant="body2">Loading clinical data…</Typography>
                )}

                <Typography
                  variant="caption"
                  sx={{ display: "block", mt: 2, color: "text.secondary" }}
                >
                  This is a synthetic FHIR-like dataset generated for portfolio and
                  educational use only. No real patient data is shown.
                </Typography>
              </Box>
            </Paper>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** ---------- small helpers ---------- */

function SidebarItem({ icon, label, selected, onClick }) {
  return (
    <ListItemButton
      selected={selected}
      onClick={onClick}
      sx={{
        "&.Mui-selected": {
          bgcolor: "rgba(255,255,255,0.16)",
          "&:hover": { bgcolor: "rgba(255,255,255,0.24)" },
        },
        "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
      }}
    >
      <ListItemIcon sx={{ color: "inherit", minWidth: 36 }}>{icon}</ListItemIcon>
      <ListItemText
        primaryTypographyProps={{ fontSize: 13 }}
        primary={label}
      />
    </ListItemButton>
  );
}

function SummaryChip({ label, value }) {
  return (
    <Chip
      label={
        <span>
          <strong>{label}:</strong> {value}
        </span>
      }
      size="small"
      sx={{
        bgcolor: "#f5f5f5",
        "& .MuiChip-label": {
          fontSize: 12,
        },
      }}
    />
  );
}

function KeyValueRow({ label, value }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
      <Typography variant="body2">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );
}

/** ---------- views ---------- */

function DashboardView({ patients, conditions, medications, encounters, loading, error }) {
  return (
    <Box sx={{ maxWidth: 1100, mx: "auto" }}>
      <Stack spacing={2}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Welcome to the FHIR Patient Viewer
        </Typography>
        <Typography variant="body2" color="text.secondary">
          This project simulates a modern FHIR-enabled clinical viewer built for my
          Master&apos;s in Health Informatics portfolio. It demonstrates how patient
          demographics, chronic conditions, medications, vitals, and encounters can be
          integrated into a single interface for clinicians and healthcare data
          analysts.
        </Typography>

        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems="stretch"
        >
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Cohort overview
              </Typography>
              {loading && <Typography>Loading cohort…</Typography>}
              {error && (
                <Typography color="error" variant="body2">
                  {error}
                </Typography>
              )}
              {!loading && !error && (
                <Stack spacing={0.5}>
                  <KeyValueRow label="Patients" value={patients.length} />
                  <KeyValueRow label="Conditions" value={conditions.length} />
                  <KeyValueRow label="Medications" value={medications.length} />
                  <KeyValueRow label="Encounters" value={encounters.length} />
                </Stack>
              )}
            </CardContent>
          </Card>

          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                How to use this app
              </Typography>
              <Typography variant="body2">
                • Use <strong>Search Patients</strong> to find a synthetic patient by ID
                or name.
              </Typography>
              <Typography variant="body2">
                • After selecting a patient, the <strong>Detail view</strong> shows
                conditions, medications, vitals, and encounters in separate tabs.
              </Typography>
              <Typography variant="body2">
                • The design is inspired by modern EHRs such as Epic and Cerner, with an
                emphasis on clean layout, clinical summaries, and simple cohort
                analytics.
              </Typography>
            </CardContent>
          </Card>
        </Stack>
      </Stack>
    </Box>
  );
}

function PatientSearchView({ search, setSearch, results, onSelectPatient, loading, error }) {
  return (
    <Box sx={{ maxWidth: 900, mx: "auto" }}>
      <Stack spacing={2}>
        <Card>
          <CardContent>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Search for a patient
            </Typography>
            <TextField
              fullWidth
              placeholder="Type patient ID or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <Typography variant="caption" color="text.secondary">
              For privacy, the app does not show the full list here – start typing to see
              matching synthetic patients.
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Matches
            </Typography>
            {loading && <Typography>Searching cohort…</Typography>}
            {error && (
              <Typography color="error" variant="body2">
                {error}
              </Typography>
            )}
            {!loading && !error && results.length === 0 && search.trim().length > 0 && (
              <Typography variant="body2">No patients match your search.</Typography>
            )}
            {!loading &&
              !error &&
              results.map((p) => (
                <ListItemButton
                  key={p.patient_id}
                  onClick={() => onSelectPatient(p)}
                  sx={{
                    alignItems: "flex-start",
                    mb: 0.5,
                    borderRadius: 1,
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {p.first_name} {p.last_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      ID: {p.patient_id} • {p.gender} • Age {p.age}
                    </Typography>
                  </Box>
                  <Chip label={p.city} size="small" variant="outlined" />
                </ListItemButton>
              ))}
            {!loading && !error && results.length === 0 && search.trim().length === 0 && (
              <Typography variant="body2" color="text.secondary">
                Start typing above to see search suggestions.
              </Typography>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}

function AnalyticsView({
  patientsByCity,
  patientsByPrimaryCondition,
  encountersByType,
  loading,
  error,
}) {
  return (
    <Box sx={{ maxWidth: 1400, mx: "auto" }}>
      <Stack spacing={2}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Cohort analytics
        </Typography>
        {loading && <Typography>Loading analytics…</Typography>}
        {error && (
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        )}
        {!loading && !error && (
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            alignItems="stretch"
          >
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  Patients by city
                </Typography>
                <Box sx={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={patientsByCity}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="city" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" name="Patients" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>

            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  Top primary conditions
                </Typography>
                <Box sx={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={patientsByPrimaryCondition}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="condition"
                        tick={{ fontSize: 9 }}
                        interval={0}
                        angle={-25}
                        textAnchor="end"
                      />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" name="Patients" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>

            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  Encounters by type
                </Typography>
                <Box sx={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={encountersByType}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="type" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" name="Encounters" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

/** ---------- detail tabs ---------- */

function PatientPhotoCard({ patient }) {
  const initials = `${patient.first_name?.[0] || ""}${patient.last_name?.[0] || ""}`;

  return (
    <Card sx={{ flex: 0.7, minWidth: 220 }}>
      <CardContent>
        <Stack spacing={1.5} alignItems="center">
          <Avatar
            sx={{
              width: 72,
              height: 72,
              fontSize: 28,
              bgcolor: "#1976D2",
            }}
          >
            {initials}
          </Avatar>
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {patient.first_name} {patient.last_name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              ID: {patient.patient_id}
            </Typography>
          </Box>
          <Box sx={{ width: "100%" }}>
            <KeyValueRow label="Age" value={patient.age} />
            <KeyValueRow label="Gender" value={patient.gender} />
            <KeyValueRow label="City" value={patient.city} />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function OverviewTab({ patient, latestSbp, latestDbp, latestHba1c, bpTrend }) {
  return (
    <Box sx={{ maxWidth: 1400, mx: "auto" }}>
      <Stack spacing={2}>
        {/* top row: profile + cards */}
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems="stretch"
        >
          <PatientPhotoCard patient={patient} />

          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Demographics
              </Typography>
              <Typography variant="body2">
                <strong>Location:</strong> {patient.city}, {patient.state}{" "}
                {patient.zip_code}
              </Typography>
              <Typography variant="body2">
                <strong>Marital status:</strong> {patient.marital_status}
              </Typography>
              <Typography variant="body2">
                <strong>Gender:</strong> {patient.gender}
              </Typography>
            </CardContent>
          </Card>

          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Insurance & Primary Problem
              </Typography>
              <Typography variant="body2">
                <strong>Insurance type:</strong> {patient.insurance_type}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                <strong>Primary condition:</strong>
              </Typography>
              <Typography variant="body2">
                {patient.primary_condition_code} –{" "}
                {patient.primary_condition_name}
              </Typography>
            </CardContent>
          </Card>
        </Stack>

        {/* snapshot */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Snapshot
            </Typography>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              alignItems="stretch"
            >
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2">
                  <strong>Blood pressure:</strong>{" "}
                  {latestSbp && latestDbp
                    ? `${latestSbp.value}/${latestDbp.value} mmHg`
                    : "Not available"}
                </Typography>
                <Typography variant="body2">
                  <strong>Latest HbA1c:</strong>{" "}
                  {latestHba1c ? `${latestHba1c.value}%` : "Not available"}
                </Typography>
              </Box>
              <Box sx={{ flex: 2, height: 180 }}>
                {bpTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={bpTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="sbp"
                        stroke="#1976D2"
                        dot={false}
                        name="Systolic"
                      />
                      <Line
                        type="monotone"
                        dataKey="dbp"
                        stroke="#C62828"
                        dot={false}
                        name="Diastolic"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    No blood pressure trend data available.
                  </Typography>
                )}
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}

function ConditionsTab({ patientConditions, patientChronicConditions }) {
  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Chronic conditions
          </Typography>
          {patientChronicConditions.length === 0 && (
            <Typography variant="body2">None recorded.</Typography>
          )}
          {patientChronicConditions.map((c) => (
            <Box key={c.condition_id} sx={{ mb: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {c.condition_code} – {c.condition_name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Onset: {c.onset_date}
              </Typography>
            </Box>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            All recorded conditions
          </Typography>
          {patientConditions.length === 0 && (
            <Typography variant="body2">No conditions recorded.</Typography>
          )}
          {patientConditions.map((c) => (
            <Box
              key={c.condition_id}
              sx={{
                mb: 1,
                pb: 1,
                borderBottom: "1px dashed #eee",
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {c.condition_code} – {c.condition_name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Onset: {c.onset_date} •{" "}
                {c.chronic_flag === 1 ? "Chronic" : "Acute / episodic"}
              </Typography>
            </Box>
          ))}
        </CardContent>
      </Card>
    </Stack>
  );
}

function MedicationsTab({ patientMeds, patientActiveMeds }) {
  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Active medications
          </Typography>
          {patientActiveMeds.length === 0 && (
            <Typography variant="body2">No active medications.</Typography>
          )}
          {patientActiveMeds.map((m) => (
            <Box
              key={m.medication_id}
              sx={{
                mb: 1,
                pb: 1,
                borderBottom: "1px dashed #eee",
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {m.medication_name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                ATC: {m.atc_code} • Started: {m.start_date}
              </Typography>
            </Box>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Full medication history
          </Typography>
          {patientMeds.length === 0 && (
            <Typography variant="body2">No medications recorded.</Typography>
          )}
          {patientMeds.map((m) => (
            <Box
              key={m.medication_id}
              sx={{
                mb: 1,
                pb: 1,
                borderBottom: "1px dashed #eee",
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {m.medication_name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                ATC: {m.atc_code} • Start: {m.start_date} •{" "}
                {m.end_date ? `End: ${m.end_date}` : "Ongoing"}
              </Typography>
            </Box>
          ))}
        </CardContent>
      </Card>
    </Stack>
  );
}

function VitalsTab({ patientObs, getLatestObservation, bpTrend }) {
  const latestHr = getLatestObservation("Heart Rate");
  const latestBmi = getLatestObservation("BMI");
  const latestChol = getLatestObservation("Total Cholesterol");

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Key latest values
          </Typography>
          <Stack spacing={0.5}>
            <KeyValueRow
              label="Blood pressure"
              value={
                bpTrend.length > 0
                  ? `${bpTrend[bpTrend.length - 1].sbp}/${bpTrend[bpTrend.length - 1].dbp} mmHg`
                  : "Not available"
              }
            />
            <KeyValueRow
              label="Heart rate"
              value={latestHr ? `${latestHr.value} bpm` : "Not available"}
            />
            <KeyValueRow
              label="BMI"
              value={latestBmi ? `${latestBmi.value} kg/m²` : "Not available"}
            />
            <KeyValueRow
              label="Total cholesterol"
              value={latestChol ? `${latestChol.value} mg/dL` : "Not available"}
            />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Blood pressure trend
          </Typography>
          <Box sx={{ height: 220 }}>
            {bpTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={bpTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="sbp"
                    stroke="#1976D2"
                    dot={false}
                    name="Systolic"
                  />
                  <Line
                    type="monotone"
                    dataKey="dbp"
                    stroke="#C62828"
                    dot={false}
                    name="Diastolic"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Typography variant="caption" color="text.secondary">
                No blood pressure data available.
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            All observations (most recent first)
          </Typography>
          {patientObs.length === 0 && (
            <Typography variant="body2">No vitals or labs recorded.</Typography>
          )}
          {patientObs
            .slice()
            .sort(
              (a, b) =>
                new Date(b.observation_date).getTime() -
                new Date(a.observation_date).getTime()
            )
            .map((o) => {
              const isOutOfRange = o.normal_flag === 0;
              return (
                <Box
                  key={o.observation_id}
                  sx={{
                    mb: 1,
                    pb: 1,
                    borderBottom: "1px dashed #eee",
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 500, color: isOutOfRange ? "#C62828" : "inherit" }}
                  >
                    {o.observation_type}: {o.value} {o.unit}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Date: {o.observation_date} • Normal range: {o.normal_range_low}–
                    {o.normal_range_high} {o.unit} •{" "}
                    {isOutOfRange ? "Out of range" : "Within range"}
                  </Typography>
                </Box>
              );
            })}
        </CardContent>
      </Card>
    </Stack>
  );
}

function EncountersTab({ patientEncounters }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          Encounters
        </Typography>
        {patientEncounters.length === 0 && (
          <Typography variant="body2">No encounters recorded.</Typography>
        )}
        {patientEncounters
          .slice()
          .sort(
            (a, b) =>
              new Date(b.encounter_date).getTime() -
              new Date(a.encounter_date).getTime()
          )
          .map((e) => (
            <Box
              key={e.encounter_id}
              sx={{
                mb: 1,
                pb: 1,
                borderBottom: "1px dashed #eee",
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {e.encounter_type} – {e.department}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Date: {e.encounter_date} • LOS: {e.length_of_stay_days} days • Cost: $
                {e.total_cost_usd}
              </Typography>
              {e.readmitted_30d_flag === 1 && (
                <Typography
                  variant="caption"
                  sx={{ display: "block", color: "#C62828", mt: 0.3 }}
                >
                  30-day readmission flag
                </Typography>
              )}
            </Box>
          ))}
      </CardContent>
    </Card>
  );
}
