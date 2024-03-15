require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

const app = express();
const port = process.env.PORT || 5000; 

app.use(cors());
app.use(express.json());

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

});

connection.connect(err => {
  if (err) throw err;
  console.log('Connected to MySQL database');
});


let transporter = nodemailer.createTransport({
  service: 'gmail', 
  auth: {
    user: 'kannanganesh2003@gmail.com',
    pass: 'Chinnu_1234', 
  },
});


app.post('/submit-evaluation', (req, res) => {

  connection.query('SELECT email FROM students WHERE marks_locked = TRUE', (err, results) => {
    if (err) {
      console.error('Error fetching student emails:', err);
      return res.status(500).send('Error fetching student emails');
    }

    if (results.length === 0) {
      return res.status(404).send('No students with locked marks found');
    }

    const sendEmailPromises = results.map(student => {
      return transporter.sendMail({
        from: '"Your Name or School" <kannanganesh2003@gmail.com>',
        to: student.email,
        subject: 'Evaluation Submitted',
        text: 'Your grading evaluation has been submitted. Please check your dashboard for more details.',
 
      });
    });

    Promise.all(sendEmailPromises)
      .then(() => {
        res.send('Evaluations submitted and emails sent successfully.');
      })
      .catch(emailError => {
        console.error('Error sending emails:', emailError);
        res.status(500).send('Error sending emails');
      });
  });
});


app.post('/add-student', (req, res) => {
  const { studentName, rollNumber, email, mentorId } = req.body;


  const checkMentorStudentCountSql = 'SELECT COUNT(*) AS studentCount FROM students WHERE mentor_id = ?';
  connection.query(checkMentorStudentCountSql, [mentorId], (err, countResult) => {
    if (err) {
      console.error('Error checking mentor student count:', err);
      return res.status(500).send('Error checking mentor student count.');
    }

    if (countResult[0].studentCount >= 4) {
      return res.status(400).send('This mentor already has 4 students assigned. Student limit exceeded.');
    } else {

      const checkRollNumberSql = 'SELECT * FROM students WHERE Rollno = ?';
      connection.query(checkRollNumberSql, [rollNumber], (rollNumberErr, rollNumberResult) => {
        if (rollNumberErr) {
          console.error('Error checking for existing roll number:', rollNumberErr);
          return res.status(500).send('Error checking for existing roll number.');
        }

        if (rollNumberResult.length > 0) {
          return res.status(400).send('This roll number is already assigned to a mentor.');
        } else {
          const insertSql = 'INSERT INTO students (Student_name, Rollno, Email, mentor_id, Ideation, Execution, Viva) VALUES (?, ?, ?, ?, NULL, NULL, NULL)';
          connection.query(insertSql, [studentName, rollNumber, email, mentorId], (insertErr, insertResult) => {
            if (insertErr) {
              console.error('Error adding student:', insertErr);
              return res.status(500).send('Error adding student.');
            }
            console.log('Student added:', insertResult);
            return res.send('Student added successfully.');
          });
        }
      });
    }
  });
});



app.get('/students', (req, res) => {
  const sql = 'SELECT * FROM students';
  connection.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching students:', err);
      res.status(500).send('Error fetching students');
      return;
    }
    res.json(results);
  });
});


app.get('/generate-pdf-report', (req, res) => {
  connection.query('SELECT * FROM students WHERE marks_locked = TRUE', (err, results) => {
    if (err) {
      console.error('Error fetching students:', err);
      return res.status(500).send('Error generating report');
    }

    if (results.length === 0) {
      return res.status(404).send('No locked marks found');
    }

    const doc = new PDFDocument();
    let filename = `Student_Report_${Date.now()}.pdf`;
    filename = encodeURIComponent(filename);
    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');

    doc.fontSize(20).text('Student Report', { align: 'center' });
    doc.moveDown(2);

    let yPosition = 120;

    doc.fontSize(12).fillColor('black');
    const headers = ['Student Name', 'Roll No', 'Mentor ID', 'Ideation', 'Execution', 'Viva'];
    let xPosition = 50; 
    headers.forEach(header => {
      doc.text(header, xPosition, yPosition, { bold: true });
      xPosition += 90; 
    });

    yPosition += 20; 
    doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(50, yPosition).lineTo(550, yPosition).stroke();
    yPosition += 20;

    // Rows for each student without email
    results.forEach(student => {
      xPosition = 50;
      doc.text(student.Student_name, xPosition, yPosition);
      xPosition += 90;
      doc.text(student.Rollno.toString(), xPosition, yPosition);
      xPosition += 90;
      doc.text(student.mentor_id.toString(), xPosition, yPosition);
      xPosition += 90;
      doc.text(student.Ideation.toString(), xPosition, yPosition);
      xPosition += 90;
      doc.text(student.Execution.toString(), xPosition, yPosition);
      xPosition += 90;
      doc.text(student.Viva.toString(), xPosition, yPosition);
      yPosition += 20; 
    });

    // Finalize PDF and end response
    doc.pipe(res);
    doc.end();
  });
});


app.get('/check-lock/:rollNo', (req, res) => {
  const sql = 'SELECT marks_locked FROM students WHERE Rollno = ?';
  connection.query(sql, [req.params.rollNo], (err, results) => {
    if (err) {
      console.error('Error checking if marks are locked:', err);
      res.status(500).send('Error checking if marks are locked');
      return;
    }
    if (results.length === 0) {
      res.status(404).send('Student not found');
      return;
    }
    res.json({ marks_locked: results[0].marks_locked });
  });
});


app.get('/check-all-marks-locked', (req, res) => {
  connection.query('SELECT COUNT(*) AS unlockedCount FROM students WHERE marks_locked = FALSE', (err, result) => {
    if (err) {
      console.error('Error checking marks locked status:', err);
      return res.status(500).send('Error checking marks locked status');
    }
    res.json({ allLocked: result[0].unlockedCount === 0 });
  });
});



// Route to delete a student by RollNo
app.delete('/delete-student/:rollNo', (req, res) => {
  const { rollNo } = req.params;
  const sql = 'DELETE FROM students WHERE Rollno = ?';
  connection.query(sql, [rollNo], (err, result) => {
    if (err) {
      console.error('Error deleting student by Rollno:', err);
      res.status(500).send('Error deleting student');
      return;
    }
    if (result.affectedRows === 0) {
      res.status(404).send('Student not found');
    } else {
      console.log(`Student with Rollno ${rollNo} deleted:`, result);
      res.send({ message: 'Student deleted successfully', rollNo: rollNo });
    }
  });
});

//  Add marks for a student
app.post('/add-marks', (req, res) => {
  const { rollNumber, ideationScore, executionScore, vivaScore } = req.body;
  const sql = 'UPDATE students SET Ideation = ?, Execution = ?, Viva = ? WHERE Rollno = ?';

  connection.query(sql, [ideationScore, executionScore, vivaScore, rollNumber], (err, result) => {
    if (err) {
      console.error('Error updating marks:', err);
      res.status(500).send('Error updating marks');
      return;
    }
    if (result.affectedRows === 0) {
      res.status(404).send('Student not found');
    } else {
      console.log('Marks updated:', result);
      res.send('Marks updated successfully');
    }
  });
});



// Route to lock a student's marks
app.post('/lock-marks/:rollNo', (req, res) => {
  const { rollNo } = req.params;
  const sql = 'UPDATE students SET marks_locked = TRUE WHERE Rollno = ? AND Ideation IS NOT NULL AND Execution IS NOT NULL AND Viva IS NOT NULL';

  connection.query(sql, [rollNo], (err, result) => {
    if (err) {
      console.error('Error locking marks:', err);
      res.status(500).send('Error locking marks');
      return;
    }
    if (result.affectedRows === 0) {
      res.status(404).send('Marks not found or already locked/cannot be locked');
    } else {
      console.log(`Marks locked for Rollno ${rollNo}`);
      res.send({ message: 'Marks locked successfully', rollNo: rollNo });
    }
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

