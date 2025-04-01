// Mock dependencies BEFORE requiring the controller or db
jest.mock('better-sqlite3', () => {
  const mockStatement = { run: jest.fn(), get: jest.fn(), all: jest.fn(), [Symbol.iterator]: jest.fn(function*() {}) };
  const mockDbInstance = {
    prepare: jest.fn(() => mockStatement),
    exec: jest.fn(), close: jest.fn(),
    pragma: jest.fn(() => []), // Prevent initialization errors in db.js
    transaction: jest.fn((fn) => jest.fn((...args) => fn(...args))), // Mock transaction
  };
  return jest.fn(() => mockDbInstance);
});

jest.mock('../models/db', () => ({
    get_texts: jest.fn(),
    add_text: jest.fn(),
    get_text: jest.fn(),
    update_text: jest.fn(),
    delete_text: jest.fn(),
    save_progress: jest.fn(),
    update_text_order: jest.fn(),
    create_category: jest.fn(),
    get_categories: jest.fn(),
    delete_category: jest.fn(),
    get_folders: jest.fn(),
    get_all_categories_flat: jest.fn(), // Added mock function
    get_files: jest.fn(),
    create_folder: jest.fn(),
    get_file_metadata: jest.fn(),
    delete_file: jest.fn(),
    delete_folder: jest.fn(),
}));

jest.mock('../middleware/authMiddleware', () => ({
    requireLogin: jest.fn((req, res, next) => {
        if (!req.session) req.session = {};
        if (!req.session.user) req.session.user = { id: 1, username: 'testuser' };
        next();
    }),
    requireOwnership: jest.fn(async (req, res, next) => {
        const textId = parseInt(req.params.text_id);
        const userId = req.session?.user?.id;
        if (userId === 1 && (textId === 100 || textId === 101)) {
            req.text = { id: textId, user_id: userId, title: `Mock Text ${textId}`, content: 'Content', progress_index: 0 };
            next();
        } else {
            if (res && typeof res.status === 'function' && typeof res.send === 'function') {
                 res.status(403).send('Forbidden');
            } else { console.error("Mock Middleware Error: Response object not fully functional in requireOwnership."); }
        }
    }),
}));

// Mock fs separately
jest.mock('fs');

jest.mock('tmp', () => ({
    tmpNameSync: jest.fn(() => '/tmp/mock-temp-file.pdf'),
}));

jest.mock('child_process', () => ({
    execFileSync: jest.fn(),
}));

// --- Require Controller AFTER mocks ---
const textControllerRouter = require('../controllers/textController');
const db = require('../models/db');
const { requireLogin, requireOwnership } = require('../middleware/authMiddleware');
const fs = require('fs'); // fs is now the mock object
const tmp = require('tmp');
const { execFileSync } = require('child_process');

// Helper to find route handlers
const findHandler = (method, pathPattern) => {
    const layer = textControllerRouter.stack.find((l) => {
        if (!l.route) return false;
        const expressPath = l.route.path;
        const methodMatch = l.route.methods[method];
        // Use regex to match express paths like /:param
        const pattern = expressPath.replace(/:[^/]+/g, '([^/]+)');
        const regex = new RegExp(`^${pattern}$`);
        return methodMatch && regex.test(pathPattern.split('?')[0]); // Test against path part only
    });
    if (!layer) throw new Error(`Handler for ${method.toUpperCase()} ${pathPattern} not found`);
    // Return the actual handler function (often the last in the stack)
    return layer.route.stack[layer.route.stack.length - 1].handle;
};


// Helper to create mock request/response
const mockRequest = (sessionData = {}, bodyData = {}, queryData = {}, paramsData = {}, fileData = null) => {
  const user = sessionData.user || { id: 1, username: 'testuser' };
  return {
    session: { user, ...sessionData },
    body: bodyData,
    query: queryData,
    params: paramsData,
    file: fileData,
    text: null, // Reset potentially attached text
  };
};

const mockResponse = () => {
  const res = {};
  res.render = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.download = jest.fn((path, filename, callback) => { if (callback) callback(null); return res; });
  res.pipe = jest.fn();
  res.headersSent = false;
  return res;
};

// Mock fs.createReadStream return value at module scope
const mockReadStream = { pipe: jest.fn(), on: jest.fn() };
// fs.createReadStream is already mocked by jest.mock('fs')
// We need to set its return value in beforeEach AFTER clearAllMocks

describe('Text Controller', () => {
    let req;
    let res;

    beforeEach(() => {
        jest.clearAllMocks(); // Clears history, calls, instances, and results
        res = mockResponse();

        // Re-apply default mock implementations/return values AFTER clearAllMocks
        fs.existsSync.mockReturnValue(true);
        fs.unlinkSync.mockClear();
        fs.writeFileSync.mockClear();
        fs.createReadStream.mockReturnValue(mockReadStream); // Re-set return value here
        tmp.tmpNameSync.mockReturnValue('/tmp/mock-temp-file.pdf');
        execFileSync.mockClear();

        // Re-mock middleware implementations if needed (though usually not necessary if stateless)
        // requireLogin.mockImplementation(...)
        // requireOwnership.mockImplementation(...)
    });

    // --- GET /profile ---
    describe('GET /profile', () => {
        const getProfileHandler = findHandler('get', '/profile');

        test('should render profile with user stats', async () => {
            req = mockRequest();
            // Mock placeholder stats (eventually mock db.get_user_stats)
            const mockStats = {
                textsPracticed: 0,
                totalPracticeTime: '0h 0m',
                averageAccuracy: 0
            };
            // db.get_user_stats.mockReturnValue(mockStats); // Uncomment when implemented

            await getProfileHandler(req, res);

            // expect(requireLogin).toHaveBeenCalledTimes(1); // Removed check
            // expect(db.get_user_stats).toHaveBeenCalledWith(req.session.user.id); // Uncomment when implemented
            expect(db.get_texts).not.toHaveBeenCalled(); // Should not fetch texts anymore
            expect(res.render).toHaveBeenCalledWith('profile', {
                user: req.session.user,
                stats: mockStats, // Expect stats object
                message: null
            });
        });

        // This test is less relevant now as profile doesn't directly show texts,
        // but we can keep it to ensure it renders correctly even if stats are empty/null
        test('should render profile correctly even if stats are unavailable', async () => {
            req = mockRequest();
            // Simulate stats being null or undefined (e.g., if db.get_user_stats fails or returns nothing)
            // db.get_user_stats.mockReturnValue(null); // Uncomment when implemented

            await getProfileHandler(req, res);

            expect(db.get_texts).not.toHaveBeenCalled();
            expect(res.render).toHaveBeenCalledWith('profile', {
                user: req.session.user,
                // Expect stats to be the placeholder object defined in the controller for now
                stats: { textsPracticed: 0, totalPracticeTime: '0h 0m', averageAccuracy: 0 },
                message: null
            });
        });

         test('should handle errors fetching stats', async () => {
            req = mockRequest();
            const error = new Error('DB Error fetching stats');
            // Simulate error during stat fetching (when implemented)
            // db.get_user_stats.mockImplementation(() => { throw error; });

            // For now, since stats are hardcoded, we simulate an error *within* the handler
            // by mocking the render function to throw an error after stats are assigned.
            // This isn't ideal, but tests the catch block.
            // A better approach is to mock the DB call when stats are implemented.
            const originalRender = res.render;
            res.render = jest.fn(() => { throw error; });


            await getProfileHandler(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            // The error message comes from the catch block in the controller
            expect(res.send).toHaveBeenCalledWith("Error loading profile.");
            res.render = originalRender; // Restore original mock
        });
    });

    // --- GET /add_text ---
    describe('GET /add_text', () => {
        const getAddTextHandler = findHandler('get', '/add_text');

        test('should render add_text view', async () => {
            req = mockRequest();
            db.get_all_categories_flat.mockReturnValue([]); // Mock successful category fetch
            await getAddTextHandler(req, res);

            // expect(requireLogin).toHaveBeenCalledTimes(1); // Removed check
            expect(res.render).toHaveBeenCalledWith('add_text', {
                user: req.session.user,
                error: null,
                title: '',
                content: '',
                categories: [] // Expect categories array now
            });
        });
    });

    // --- POST /add_text ---
    describe('POST /add_text', () => {
        const postAddTextHandler = findHandler('post', '/add_text');

        // Textarea Input
        test('should add text from textarea successfully', async () => {
            req = mockRequest({}, { title: 'New Text', content: 'Some content.' });
            db.add_text.mockReturnValue(123);

            await postAddTextHandler(req, res);

            // expect(requireLogin).toHaveBeenCalledTimes(1); // Removed check
            expect(db.add_text).toHaveBeenCalledWith(req.session.user.id, 'New Text', 'Some content.', null); // Added null for category_id
            expect(res.redirect).toHaveBeenCalledWith('/texts?message=Text added successfully!');
            expect(res.render).not.toHaveBeenCalled();
        });

        test('should fail if title is empty (textarea)', async () => {
            req = mockRequest({}, { title: '', content: 'Some content.' });
            await postAddTextHandler(req, res);

            expect(db.add_text).not.toHaveBeenCalled();
            expect(res.render).toHaveBeenCalledWith('add_text', expect.objectContaining({ error: 'Title cannot be empty.' }));
            expect(res.redirect).not.toHaveBeenCalled();
        });

        test('should fail if content is empty (textarea)', async () => {
            req = mockRequest({}, { title: 'A Title', content: '' }); // No file either
            await postAddTextHandler(req, res);

            expect(db.add_text).not.toHaveBeenCalled();
            expect(res.render).toHaveBeenCalledWith('add_text', expect.objectContaining({ error: 'Please provide text content or upload a PDF file.' }));
            expect(res.redirect).not.toHaveBeenCalled();
        });

         test('should fail if db.add_text fails (textarea)', async () => {
            req = mockRequest({}, { title: 'DB Fail Text', content: 'Content' });
            db.add_text.mockReturnValue(-1); // Simulate DB error
            db.get_all_categories_flat.mockReturnValue([]); // Mock category fetch for error render

            await postAddTextHandler(req, res);

            expect(db.add_text).toHaveBeenCalledWith(req.session.user.id, 'DB Fail Text', 'Content', null); // Added null for category_id
            expect(res.render).toHaveBeenCalledWith('add_text', expect.objectContaining({ error: 'Failed to save text to the database. Please try again.' }));
            expect(res.redirect).not.toHaveBeenCalled();
        });


        // PDF Input
        const mockPdfFile = {
            fieldname: 'pdfFile',
            originalname: 'test.pdf',
            mimetype: 'application/pdf',
            buffer: Buffer.from('mock pdf content'), // Simulate file buffer from memoryStorage
            size: 12345
        };

        test('should add text from PDF successfully', async () => {
            req = mockRequest({}, { title: 'PDF Text' }, {}, {}, mockPdfFile); // No content in body
            const extractedText = ' Extracted PDF text. ';
            const cleanedText = 'Extracted PDF text.'; // Simulate cleanup result
            execFileSync.mockReturnValue(extractedText); // Mock pdftotext output
            db.add_text.mockReturnValue(124); // Mock successful insert

            await postAddTextHandler(req, res);

            expect(tmp.tmpNameSync).toHaveBeenCalled();
            expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/mock-temp-file.pdf', mockPdfFile.buffer);
            expect(execFileSync).toHaveBeenCalledWith('pdftotext', ['-enc', 'UTF-8', '/tmp/mock-temp-file.pdf', '-'], { encoding: 'utf8' });
            expect(db.add_text).toHaveBeenCalledWith(req.session.user.id, 'PDF Text', cleanedText, null); // Added null for category_id
            expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/mock-temp-file.pdf');
            expect(res.redirect).toHaveBeenCalledWith('/texts?message=Text added successfully!');
            expect(res.render).not.toHaveBeenCalled();
        });

        test('should fail if title is empty (PDF)', async () => {
            req = mockRequest({}, { title: '' }, {}, {}, mockPdfFile);
            await postAddTextHandler(req, res);

            expect(execFileSync).not.toHaveBeenCalled();
            expect(db.add_text).not.toHaveBeenCalled();
            expect(res.render).toHaveBeenCalledWith('add_text', expect.objectContaining({ error: 'Title cannot be empty.' }));
            expect(res.redirect).not.toHaveBeenCalled();
        });

        test('should fail if both PDF and content provided', async () => {
            req = mockRequest({}, { title: 'Both Inputs', content: 'Textarea content' }, {}, {}, mockPdfFile);
            await postAddTextHandler(req, res);

            expect(execFileSync).not.toHaveBeenCalled();
            expect(db.add_text).not.toHaveBeenCalled();
            expect(res.render).toHaveBeenCalledWith('add_text', expect.objectContaining({ error: 'Please provide text content OR upload a PDF, not both.' }));
            expect(res.redirect).not.toHaveBeenCalled();
        });

        test('should fail if pdftotext command not found (ENOENT)', async () => {
            req = mockRequest({}, { title: 'PDF Error' }, {}, {}, mockPdfFile);
            const error = new Error('Command not found');
            error.code = 'ENOENT';
            execFileSync.mockImplementation(() => { throw error; });

            await postAddTextHandler(req, res);

            expect(tmp.tmpNameSync).toHaveBeenCalled();
            expect(fs.writeFileSync).toHaveBeenCalled();
            expect(execFileSync).toHaveBeenCalled();
            expect(db.add_text).not.toHaveBeenCalled();
            expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/mock-temp-file.pdf');
            expect(res.render).toHaveBeenCalledWith('add_text', expect.objectContaining({ error: expect.stringContaining('pdftotext command not found') }));
            expect(res.redirect).not.toHaveBeenCalled();
        });

        test('should fail if pdftotext extraction fails (other error)', async () => {
            req = mockRequest({}, { title: 'PDF Error' }, {}, {}, mockPdfFile);
            const error = new Error('PDF processing failed');
            execFileSync.mockImplementation(() => { throw error; });

            await postAddTextHandler(req, res);

            expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/mock-temp-file.pdf');
            expect(res.render).toHaveBeenCalledWith('add_text', expect.objectContaining({ error: expect.stringContaining('Error processing PDF with pdftotext') }));
            expect(res.redirect).not.toHaveBeenCalled();
        });

         test('should fail if extracted PDF text is empty', async () => {
            req = mockRequest({}, { title: 'Empty PDF' }, {}, {}, mockPdfFile);
            execFileSync.mockReturnValue('');

            await postAddTextHandler(req, res);

            expect(execFileSync).toHaveBeenCalled();
            expect(db.add_text).not.toHaveBeenCalled();
            expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/mock-temp-file.pdf');
            expect(res.render).toHaveBeenCalledWith('add_text', expect.objectContaining({ error: expect.stringContaining('Could not extract text') }));
            expect(res.redirect).not.toHaveBeenCalled();
        });

         test('should fail if db.add_text fails (PDF)', async () => {
            req = mockRequest({}, { title: 'PDF DB Fail' }, {}, {}, mockPdfFile);
            execFileSync.mockReturnValue('Some extracted text.');
            db.add_text.mockReturnValue(-1);
            db.get_all_categories_flat.mockReturnValue([]); // Mock category fetch for error render

            await postAddTextHandler(req, res);

            expect(execFileSync).toHaveBeenCalled();
            expect(db.add_text).toHaveBeenCalledWith(req.session.user.id, 'PDF DB Fail', 'Some extracted text.', null); // Added null for category_id
            expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/mock-temp-file.pdf');
            expect(res.render).toHaveBeenCalledWith('add_text', expect.objectContaining({ error: 'Failed to save text to the database. Please try again.' }));
            expect(res.redirect).not.toHaveBeenCalled();
        });
    });

    // --- GET /edit_text/:text_id ---
    describe('GET /edit_text/:text_id', () => {
        const getEditTextHandler = findHandler('get', '/edit_text/:text_id');

        test('should render edit_text view with text data', async () => {
            const textId = 100;
            req = mockRequest({}, {}, {}, { text_id: textId.toString() });
            // Simulate middleware attaching text
            req.text = { id: textId, user_id: 1, title: `Mock Text ${textId}`, content: 'Content', progress_index: 0 };
            db.get_all_categories_flat.mockReturnValue([]); // Mock category fetch for GET
            await getEditTextHandler(req, res);

            // expect(requireLogin).toHaveBeenCalledTimes(1); // Removed
            // expect(requireOwnership).toHaveBeenCalledTimes(1); // Removed
            expect(db.get_all_categories_flat).toHaveBeenCalledWith(req.session.user.id); // Check category fetch
            expect(res.render).toHaveBeenCalledWith('edit_text', {
                user: req.session.user,
                text: req.text, // Check the text attached by middleware mock
                categories: [], // Expect categories array
                error: null
            });
        });

        // Test for middleware failure is implicitly covered by testing middleware directly if needed,
        // or by checking the response when calling the route via a supertest setup (more complex).
        // For unit testing the handler, we assume middleware passed if handler is reached.
    });

    // --- POST /edit_text/:text_id ---
    describe('POST /edit_text/:text_id', () => {
        const postEditTextHandler = findHandler('post', '/edit_text/:text_id');

        test('should update text successfully', async () => {
            const textId = 100;
            req = mockRequest({}, { title: 'Updated Title', content: 'Updated Content' }, {}, { text_id: textId.toString() });
            db.update_text.mockReturnValue(true);
             // Simulate middleware attaching text
            req.text = { id: textId, user_id: 1, title: 'Old Title', content: 'Old Content' };

            await postEditTextHandler(req, res);

            // expect(requireOwnership).toHaveBeenCalledTimes(1); // Removed
            expect(db.update_text).toHaveBeenCalledWith(textId.toString(), 'Updated Title', 'Updated Content', null); // Added null for category_id
            expect(res.redirect).toHaveBeenCalledWith('/texts?message=Text updated successfully!');
            expect(res.render).not.toHaveBeenCalled();
        });

        test('should fail if title is empty', async () => {
            const textId = 100;
            req = mockRequest({}, { title: '', content: 'Content' }, {}, { text_id: textId.toString() });
            // Simulate middleware attaching text for re-render
            req.text = { id: textId, title: '', content: 'Content' };

            await postEditTextHandler(req, res);

            expect(db.update_text).not.toHaveBeenCalled();
            expect(res.render).toHaveBeenCalledWith('edit_text', expect.objectContaining({
                error: 'Title and content cannot be empty.',
                text: expect.objectContaining({ id: textId.toString(), title: '', content: 'Content' })
            }));
            expect(res.redirect).not.toHaveBeenCalled();
        });

        test('should fail if content is empty', async () => {
            const textId = 100;
            req = mockRequest({}, { title: 'Title', content: '' }, {}, { text_id: textId.toString() });
            req.text = { id: textId, title: 'Title', content: '' };

            await postEditTextHandler(req, res);

            expect(db.update_text).not.toHaveBeenCalled();
            expect(res.render).toHaveBeenCalledWith('edit_text', expect.objectContaining({
                error: 'Title and content cannot be empty.',
                 text: expect.objectContaining({ id: textId.toString(), title: 'Title', content: '' })
            }));
            expect(res.redirect).not.toHaveBeenCalled();
        });

        test('should fail if db.update_text returns false', async () => {
            const textId = 100;
            req = mockRequest({}, { title: 'Updated Title', content: 'Updated Content' }, {}, { text_id: textId.toString() });
            db.update_text.mockReturnValue(false);
            req.text = { id: textId, title: 'Updated Title', content: 'Updated Content' };

            await postEditTextHandler(req, res);

            expect(db.update_text).toHaveBeenCalled();
            expect(res.render).toHaveBeenCalledWith('edit_text', expect.objectContaining({
                error: 'Failed to update text. Please try again.',
                 text: expect.objectContaining({ id: textId.toString(), title: 'Updated Title', content: 'Updated Content' })
            }));
            expect(res.redirect).not.toHaveBeenCalled();
        });
    });

    // --- POST /delete_text/:text_id ---
    describe('POST /delete_text/:text_id', () => {
        const postDeleteTextHandler = findHandler('post', '/delete_text/:text_id');

        test('should delete text successfully', async () => {
            const textId = 100;
            req = mockRequest({}, {}, {}, { text_id: textId.toString() });
            db.delete_text.mockReturnValue(true);
            req.text = { id: textId, user_id: 1 }; // Simulate middleware

            await postDeleteTextHandler(req, res);

            // expect(requireOwnership).toHaveBeenCalledTimes(1); // Removed
            expect(db.delete_text).toHaveBeenCalledWith(textId.toString());
            expect(res.redirect).toHaveBeenCalledWith('/texts?message=Text deleted successfully!');
        });

        test('should redirect with message if db.delete_text returns false', async () => {
            const textId = 100;
            req = mockRequest({}, {}, {}, { text_id: textId.toString() });
            db.delete_text.mockReturnValue(false);
            req.text = { id: textId, user_id: 1 }; // Simulate middleware

            await postDeleteTextHandler(req, res);

            expect(db.delete_text).toHaveBeenCalledWith(textId.toString());
            expect(res.redirect).toHaveBeenCalledWith('/texts?message=Could not delete text. It might have already been removed.');
        });

         test('should handle unexpected errors during deletion', async () => {
            const textId = 100;
            req = mockRequest({}, {}, {}, { text_id: textId.toString() });
            const error = new Error('DB Error');
            db.delete_text.mockImplementation(() => { throw error; });
            req.text = { id: textId, user_id: 1 }; // Simulate middleware

            await postDeleteTextHandler(req, res);

            expect(db.delete_text).toHaveBeenCalledWith(textId.toString());
            expect(res.redirect).toHaveBeenCalledWith('/texts?message=An error occurred while deleting the text.');
        });
    });

    // --- GET /practice/:text_id ---
    describe('GET /practice/:text_id', () => {
        const getPracticeHandler = findHandler('get', '/practice/:text_id');

        test('should render practice view with text data and progress', async () => {
            const textId = 100;
            const mockTextWithProgress = { id: textId, user_id: 1, title: 'Practice Text', content: 'Practice content.', progress_index: 10 };
            req = mockRequest({}, {}, {}, { text_id: textId.toString() });
            db.get_text.mockReturnValue(mockTextWithProgress);
            req.text = mockTextWithProgress; // Simulate middleware

            await getPracticeHandler(req, res);

            // expect(requireOwnership).toHaveBeenCalledTimes(1); // Removed
            expect(db.get_text).toHaveBeenCalledWith(textId.toString(), req.session.user.id);
            expect(res.render).toHaveBeenCalledWith('practice', {
                user: req.session.user,
                text: mockTextWithProgress
            });
        });

        test('should redirect if db.get_text returns null', async () => {
            const textId = 100;
            req = mockRequest({}, {}, {}, { text_id: textId.toString() });
            db.get_text.mockReturnValue(null);
            req.text = { id: textId, user_id: 1 }; // Simulate middleware

            await getPracticeHandler(req, res);

            expect(db.get_text).toHaveBeenCalledWith(textId.toString(), req.session.user.id);
            expect(res.redirect).toHaveBeenCalledWith('/texts?message=Text not found.');
            expect(res.render).not.toHaveBeenCalled();
        });

         test('should handle errors fetching text for practice', async () => {
            const textId = 100;
            req = mockRequest({}, {}, {}, { text_id: textId.toString() });
            const error = new Error('DB Error');
            db.get_text.mockImplementation(() => { throw error; });
            req.text = { id: textId, user_id: 1 }; // Simulate middleware

            await getPracticeHandler(req, res);

            expect(db.get_text).toHaveBeenCalledWith(textId.toString(), req.session.user.id);
            expect(res.redirect).toHaveBeenCalledWith('/texts?message=Error loading practice text.');
            expect(res.render).not.toHaveBeenCalled();
        });
    });

    // --- POST /save_progress ---
    describe('POST /save_progress', () => {
        const postSaveProgressHandler = findHandler('post', '/save_progress');

        test('should save progress successfully', async () => {
            req = mockRequest({}, { text_id: '100', progress_index: '55' });
            db.save_progress.mockReturnValue(true);

            await postSaveProgressHandler(req, res);

            // expect(requireLogin).toHaveBeenCalledTimes(1); // Removed
            expect(db.save_progress).toHaveBeenCalledWith(req.session.user.id, 100, 55);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ success: true });
        });

        test('should fail if text_id is missing', async () => {
            req = mockRequest({}, { progress_index: '55' });
            await postSaveProgressHandler(req, res);

            expect(db.save_progress).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Missing required data.' });
        });

        test('should fail if progress_index is missing', async () => {
            req = mockRequest({}, { text_id: '100' });
            await postSaveProgressHandler(req, res);

            expect(db.save_progress).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Missing required data.' });
        });

        test('should fail if progress_index is not a number', async () => {
            req = mockRequest({}, { text_id: '100', progress_index: 'abc' });
            await postSaveProgressHandler(req, res);

            expect(db.save_progress).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Invalid data.' });
        });

         test('should fail if progress_index is negative', async () => {
            req = mockRequest({}, { text_id: '100', progress_index: '-10' });
            await postSaveProgressHandler(req, res);

            expect(db.save_progress).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Invalid data.' });
        });


        test('should fail if db.save_progress returns false', async () => {
            req = mockRequest({}, { text_id: '100', progress_index: '55' });
            db.save_progress.mockReturnValue(false);

            await postSaveProgressHandler(req, res);

            expect(db.save_progress).toHaveBeenCalledWith(req.session.user.id, 100, 55);
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Database error saving progress.' });
        });

         test('should handle unexpected errors during save', async () => {
            req = mockRequest({}, { text_id: '100', progress_index: '55' });
            const error = new Error('DB Error');
            db.save_progress.mockImplementation(() => { throw error; });

            await postSaveProgressHandler(req, res);

            expect(db.save_progress).toHaveBeenCalledWith(req.session.user.id, 100, 55);
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Server error saving progress.' });
        });
    });
});