import 'dotenv/config';

const schoolId = '2457515';
const monitoringId = '100001';
const base = (process.env.MNE_API_BASE_URL || 'https://mne.seld.gos.pk/Services/api').replace(/\/$/, '');
const headers = JSON.parse(process.env.MNE_API_HEADERS_JSON || '{}');

async function inspect() {
  try {
    const [schoolRes, visitsRes, detailsRes, attendanceRes, enrollRes] = await Promise.all([
      fetch(`${base}//Schools/GetSchoolById/${schoolId}`, { headers }).then(r => r.json()),
      fetch(`${base}//Schools/GetMSchoollastvisitsById?SchoolId=${schoolId}`, { headers }).then(r => r.json()),
      fetch(`${base}//Schools/GetMonitoringDetailsByMonitoringId?MonitoringId=${monitoringId}`, { headers }).then(r => r.json()),
      fetch(`${base}//Schools/GetTeachersAttendanceByMonitoringId?MonitoringId=${monitoringId}`, { headers }).then(r => r.json()),
      fetch(`${base}//Schools/GetEnrolmentsByMonitoringId?MonitoringId=${monitoringId}`, { headers }).then(r => r.json())
    ]);

    console.log('\n=== SCHOOL INFO ===');
    console.log('Keys:', Object.keys(schoolRes).slice(0, 25));

    console.log('\n=== VISITS ===');
    if (visitsRes?.Data?.[0]) {
      console.log('Keys:', Object.keys(visitsRes.Data[0]));
    }

    console.log('\n=== DETAILS DATA ===');
    if (detailsRes?.Data?.length) {
      console.log(`Total fields: ${detailsRes.Data.length}`);
      detailsRes.Data.slice(0, 20).forEach((row, i) => {
        const title = row.Title || row.Question || row.QuestionTitle || row.Name || row.KRAName || `Field_${i}`;
        console.log(`${i}: ${title.slice(0, 60)}`);
      });
    }

    console.log('\n=== ATTENDANCE DATA ===');
    if (attendanceRes?.Data?.length) {
      console.log(`Total records: ${attendanceRes.Data.length}`);
      console.log('Keys in first record:', Object.keys(attendanceRes.Data[0]));
      console.log('Sample:', attendanceRes.Data.slice(0, 3).map(r => ({
        name: r.Employee_Name,
        present: r.Present,
        staffType: r.Staff_Type,
        designation: r.Designation_Name
      })));
    }

    console.log('\n=== ENROLLMENT DATA ===');
    if (enrollRes?.Data?.length) {
      console.log(`Total rows: ${enrollRes.Data.length}`);
      enrollRes.Data.forEach((row, i) => {
        console.log(`Row ${i}: Title="${row.Title}" Keys=${Object.keys(row).filter(k => !['Title','Question'].includes(k)).slice(0,5).join(',')}`);
      });
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

inspect();
