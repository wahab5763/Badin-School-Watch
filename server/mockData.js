const talukas = ['Badin', 'Golarchi', 'Matli', 'Shaheed Fazil Rahu', 'Talhar', 'Tando Bago'];
const levels = ['Primary', 'Middle', 'Secondary', 'Higher Secondary'];
const genders = ['Boys', 'Girls', 'Mixed'];
const months = [
  ['2025-04', 'Apr'], ['2025-05', 'May'], ['2025-06', 'Jun'], ['2025-07', 'Jul'],
  ['2025-08', 'Aug'], ['2025-09', 'Sep'], ['2025-10', 'Oct'], ['2025-11', 'Nov'],
  ['2025-12', 'Dec'], ['2026-01', 'Jan'], ['2026-02', 'Feb'], ['2026-03', 'Mar']
];

function hash(input) {
  return Array.from(String(input)).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 2147483647, 7);
}

function seeded(id, min, max, offset = 0) {
  const seed = Math.sin(hash(id) + offset) * 10000;
  const value = seed - Math.floor(seed);
  return min + value * (max - min);
}

function pick(list, id, offset = 0) {
  return list[Math.floor(seeded(id, 0, list.length, offset)) % list.length];
}

function buildMonthly(id, riskScore) {
  return months.map(([month, label], index) => {
    const attendanceRate = Math.max(48, Math.min(98, 88 - riskScore * 0.18 + seeded(id, -6, 6, index + 10)));
    const visits = Math.max(0, Math.round(seeded(id, 0, 6, index + 50) + (riskScore > 70 ? 2 : 0)));
    const criticalFlags = Math.max(0, Math.round((riskScore / 28) + seeded(id, -1, 2.5, index + 90)));
    return { month, label, attendanceRate: Number(attendanceRate.toFixed(1)), visits, criticalFlags };
  });
}

function buildMockTeachers(schoolId, teacherTotal, teacherPresent, teacherLeave) {
  return Array.from({ length: teacherTotal }, (_, index) => {
    const id = `${schoolId}-${index + 1}`;
    const isPresent = index < teacherPresent;
    const isLeave = !isPresent && index < teacherPresent + teacherLeave;
    return {
      id,
      name: `Teacher ${String(index + 1).padStart(2, '0')}`,
      cnic: null,
      present: isPresent,
      leaveType: isLeave ? 'Official leave' : null,
      absentReason: !isPresent && !isLeave ? 'Absent' : null,
      remarks: null,
      status: isPresent ? 'Present' : isLeave ? 'Leave: Official leave' : 'Absent: Absent',
      imageUrl: null
    };
  });
}

function buildMockVisitEvidence(schoolId) {
  const seed = Number(String(schoolId).slice(-3)) || 1;
  const items = [
    {
      id: `${schoolId}-school-1`,
      category: 'school',
      title: 'School front view',
      url: `https://picsum.photos/seed/${seed}-school-front/1200/800`
    },
    {
      id: `${schoolId}-school-2`,
      category: 'school',
      title: 'Classroom condition',
      url: `https://picsum.photos/seed/${seed}-school-room/1200/800`
    },
    {
      id: `${schoolId}-muster-1`,
      category: 'musterRoll',
      title: 'Muster roll',
      url: `https://picsum.photos/seed/${seed}-muster/1200/800`
    },
    {
      id: `${schoolId}-washroom-1`,
      category: 'washroom',
      title: 'Washroom status',
      url: `https://picsum.photos/seed/${seed}-washroom/1200/800`
    },
    {
      id: `${schoolId}-visit-1`,
      category: 'visit',
      title: 'Monitoring visit evidence',
      url: `https://picsum.photos/seed/${seed}-visit/1200/800`
    }
  ];

  return {
    items,
    byCategory: {
      school: items.filter((item) => item.category === 'school'),
      musterRoll: items.filter((item) => item.category === 'musterRoll'),
      washroom: items.filter((item) => item.category === 'washroom'),
      visit: items.filter((item) => item.category === 'visit'),
      other: items.filter((item) => item.category === 'other')
    }
  };
}

export function buildMockDashboard(rows, academicYear) {
  const schools = rows.map((row, index) => {
    const taluka = pick(talukas, row.schoolId, 1);
    const uc = `UC-${String(Math.floor(seeded(row.schoolId, 1, 18, 2))).padStart(2, '0')}`;
    const level = pick(levels, row.schoolId, 3);
    const gender = pick(genders, row.schoolId, 4);
    const lat = 24.55 + seeded(row.schoolId, -0.33, 0.34, 5);
    const lng = 68.75 + seeded(row.schoolId, -0.3, 0.28, 6);

    const buildingScore = seeded(row.schoolId, 20, 100, 7);
    const waterScore = seeded(row.schoolId, 10, 100, 8);
    const wallScore = seeded(row.schoolId, 10, 100, 9);
    const electricityScore = seeded(row.schoolId, 10, 100, 10);
    const washroomScore = seeded(row.schoolId, 10, 100, 11);
    const readiness = Number(((buildingScore + waterScore + wallScore + electricityScore + washroomScore) / 5).toFixed(1));
    const riskScore = Number((100 - readiness * 0.7 + seeded(row.schoolId, 2, 30, 12)).toFixed(1));

    const teacherTotal = Math.max(3, Math.round(seeded(row.schoolId, 4, 18, 13)));
    const teacherPresent = Math.max(0, Math.min(teacherTotal, Math.round(teacherTotal - riskScore / 26 + seeded(row.schoolId, 0, 3, 14))));
    const teacherLeave = Math.max(0, Math.min(teacherTotal - teacherPresent, Math.round(seeded(row.schoolId, 0, 2, 15))));
    const teacherAbsent = Math.max(0, teacherTotal - teacherPresent - teacherLeave);
    const attendanceRate = Number(((teacherPresent / teacherTotal) * 100).toFixed(1));
    const teachers = buildMockTeachers(row.schoolId, teacherTotal, teacherPresent, teacherLeave);
    const visitEvidence = buildMockVisitEvidence(row.schoolId);

    const enrollmentTotal = Math.max(35, Math.round(seeded(row.schoolId, 70, 780, 16)));
    const boys = Math.round(enrollmentTotal * seeded(row.schoolId, 0.42, 0.58, 17));
    const girls = Math.max(0, enrollmentTotal - boys);
    const rooms = Math.max(2, Math.round(seeded(row.schoolId, 2, 18, 18)));
    const teachingRooms = Math.max(1, Math.round(rooms * seeded(row.schoolId, 0.55, 0.95, 19)));
    const classroomCapacity = teachingRooms * 38;
    const overCapacity = enrollmentTotal > classroomCapacity;

    const textbooksRequired = Math.max(30, enrollmentTotal + Math.round(seeded(row.schoolId, 0, 85, 20)));
    const textbooksReceived = Math.max(0, textbooksRequired - Math.round(seeded(row.schoolId, 0, 120, 21)));
    const textbooksDistributed = Math.max(0, Math.min(textbooksReceived, textbooksReceived - Math.round(seeded(row.schoolId, -20, 55, 22))));
    const textbooksShortage = Math.max(0, textbooksRequired - textbooksDistributed);
    const textbookSurplus = Math.max(0, textbooksReceived - textbooksRequired);

    const flags = [];
    if (waterScore < 45) flags.push('water gap');
    if (washroomScore < 45) flags.push('non-functional washrooms');
    if (buildingScore < 45) flags.push('unsafe structure');
    if (wallScore < 45) flags.push('weak boundary wall');
    if (electricityScore < 45) flags.push('power outage risk');
    if (attendanceRate < 72) flags.push('teacher attendance low');
    if (textbooksShortage > enrollmentTotal * 0.25) flags.push('textbook shortage');
    if (overCapacity) flags.push('overcrowding');

    const schoolStatus = riskScore > 93 ? 'Permanent Closed' : riskScore > 85 ? 'Temporary Closed' : 'Open';
    const monthly = buildMonthly(row.schoolId, riskScore);
    const latestMonth = monthly[monthly.length - 1];
    const visitDates = monthly.flatMap((entry) => {
      if (!entry.visits) return [];
      return Array.from({ length: entry.visits }, (_, idx) => {
        const day = String(Math.min(28, 2 + idx * 3)).padStart(2, '0');
        return `${entry.month}-${day}T09:30:00`;
      });
    });

    return {
      schoolId: row.schoolId,
      schoolName: row.schoolName,
      semis: row.semis,
      district: 'Badin',
      taluka,
      uc,
      level,
      gender,
      schoolStatus,
      monitoringId: null,
      lastVisitDate: `${latestMonth.month}-18T09:30:00`,
      visitCount: monthly.reduce((sum, item) => sum + item.visits, 0),
      visitDates,
      monthly,
      coordinates: { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) },
      attendance: {
        total: teacherTotal,
        present: teacherPresent,
        leave: teacherLeave,
        absent: teacherAbsent,
        rate: attendanceRate,
        teachers
      },
      census: {
        buildingOwnership: seeded(row.schoolId, 0, 1, 27) > 0.5 ? 'Owned' : 'Rented',
        buildingCondition: buildingScore >= 70 ? 'Good' : buildingScore >= 45 ? 'Needs Repair' : 'Unsafe',
        boundaryWall: wallScore >= 60 ? 'Available' : 'Missing/Unsafe',
        drinkingWater: waterScore >= 60 ? 'Available' : 'Not Reliable',
        electricity: electricityScore >= 60 ? 'Available' : 'Not Reliable',
        washroomsTotal: Math.max(1, Math.round(seeded(row.schoolId, 1, 10, 23))),
        washroomsFunctional: Math.max(0, Math.round(seeded(row.schoolId, 0, 8, 24))),
        handWash: washroomScore >= 55 ? 'Yes' : 'No',
        rooms,
        teachingRooms,
        readiness,
        duration: Math.round(seeded(row.schoolId, 12, 74, 25)),
        smcFunctional: seeded(row.schoolId, 0, 1, 26) > 0.28 ? 'Yes' : 'No'
      },
      enrollment: {
        total: enrollmentTotal,
        boys,
        girls,
        overCapacity,
        classroomCapacity
      },
      textbooks: {
        required: textbooksRequired,
        received: textbooksReceived,
        distributed: textbooksDistributed,
        shortage: textbooksShortage,
        surplus: textbookSurplus
      },
      visitEvidence,
      riskScore: Number(Math.min(99, Math.max(22, riskScore)).toFixed(1)),
      qualityScore: Number(Math.max(25, Math.min(98, (attendanceRate * 0.45 + readiness * 0.55))).toFixed(1)),
      flags,
      monitor: {
        name: `Monitor ${String((index % 24) + 1).padStart(2, '0')}`,
        id: `MA-${String((index % 24) + 1).padStart(3, '0')}`
      }
    };
  });

  return buildDashboardPayload(schools, academicYear, 'mock');
}

export function buildDashboardPayload(schools, academicYear, source = 'live') {
  const totalVisits = schools.reduce((sum, school) => sum + (school.visitCount || 0), 0);
  const flagCounts = schools.reduce((acc, school) => {
    (school.flags || []).forEach((flag) => { acc[flag] = (acc[flag] || 0) + 1; });
    return acc;
  }, {});
  const topDeficiencies = Object.entries(flagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([flag, count]) => ({ flag, count }));

  const summary = {
    totalSchools: schools.length,
    totalVisits,
    attendanceRate: Number((schools.reduce((sum, school) => sum + school.attendance.rate, 0) / Math.max(schools.length, 1)).toFixed(1)),
    enrollment: schools.reduce((sum, school) => sum + school.enrollment.total, 0),
    textbookGap: schools.reduce((sum, school) => sum + school.textbooks.shortage, 0),
    criticalFlags: schools.filter((school) => school.riskScore >= 80).length,
    averageRisk: Number((schools.reduce((sum, school) => sum + school.riskScore, 0) / Math.max(schools.length, 1)).toFixed(1)),
    topDeficiencies
  };

  const options = {
    talukas: [...new Set(schools.map((school) => school.taluka).filter(Boolean))].sort(),
    levels: [...new Set(schools.map((school) => school.level).filter(Boolean))].sort(),
    genders: [...new Set(schools.map((school) => school.gender).filter(Boolean))].sort(),
    statuses: [...new Set(schools.map((school) => school.schoolStatus).filter(Boolean))].sort()
  };

  return {
    source,
    generatedAt: new Date().toISOString(),
    academicYear: {
      start: academicYear.start,
      end: academicYear.end,
      label: academicYear.label
    },
    months: months.map(([month, label]) => ({ month, label })),
    summary,
    options,
    schools
  };
}
