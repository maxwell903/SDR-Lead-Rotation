# SDR Lead Rotation System

A web-based lead rotation system that improves upon the traditional spreadsheet approach while maintaining all existing functionality.

## Features

### Core Functionality
- **Visual Calendar Grid**: Month-based calendar showing days 1-31 with sales rep columns
- **Dual Rotation System**: Separate rotations for Sub-1K and 1K+ unit leads
- **Smart Lead Assignment**: Automatic assignment based on rep parameters and rotation order
- **Parameter Management**: Configurable property types, unit limits, and 1K+ capabilities
- **Entry Types**: Support for leads, skips, OOO (out of office), and next indicators

### Key Improvements Over Spreadsheet
- **Interactive Interface**: Click to add/edit entries with guided forms
- **Real-time Updates**: Automatic rotation advancement after lead assignments
- **Parameter Validation**: Ensures leads are only assigned to eligible reps
- **Visual Indicators**: Color-coded cells for different entry types
- **Hyperlinked Leads**: Account numbers link directly to prospect URLs
- **Comment Management**: Add, edit, and view comments for each lead

### Sales Rep Parameters
Each sales rep can be configured with:
- **Property Types**: MFH (Multi-Family Housing), MF (Manufactured), SFH (Single-Family Housing), Commercial
- **Unit Limits**: Maximum number of units they can handle (e.g., 200 unit max)
- **1K+ Capability**: Whether they can handle leads with 1000+ units

### Entry Types
1. **Lead Numbers**: Hyperlinked account numbers with URLs and comments
2. **Skip**: When a rep gets a demo before their rotation turn
3. **OOO**: Out of office - rep unavailable for that day
4. **Next**: Visual indicator showing who's next in rotation

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. Clone or download the project files
2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:3000`

### Build for Production
```bash
npm run build
```

## Usage

### Adding a Lead
1. Click "Add Lead" button or click on any calendar cell
2. Fill in the lead details:
   - Account Number (required)
   - URL (required)
   - Property Types (at least one required)
   - Unit Count (required)
   - Comments (optional)
3. The system automatically assigns to the next eligible rep based on parameters

### Managing Sales Reps
1. Click "Manage Reps" to add/remove sales representatives
2. Use "Parameters" to configure each rep's capabilities and limits

### Adding Other Entries
- Click on any calendar cell to add Skip, OOO, or Next indicators
- Edit existing entries by clicking on them

### Navigation
- Use arrow buttons to navigate between months
- Each month shows a full calendar grid with all reps

## Technical Architecture

### Built With
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Vite** for build tooling

### Key Components
- `CalendarGrid`: Main calendar display with interactive cells
- `RotationPanel`: Shows current rotation state and next up indicators  
- `LeadModal`: Form for adding/editing leads and other entries
- `SalesRepManager`: Add/remove sales representatives
- `ParametersPanel`: Configure rep parameters and capabilities

### Data Structure
The application uses local state management with plans for future database integration:
- **Sales Reps**: Configuration and parameters
- **Leads**: Account details and assignments
- **Lead Entries**: Calendar cell contents
- **Rotation State**: Current position in rotation sequences

## Future Enhancements

### Phase 2: Database Integration
- Supabase/PostgreSQL backend
- Real-time collaboration
- Data persistence
- User authentication

### Phase 3: Advanced Features
- Reporting and analytics
- Bulk operations
- Export functionality
- Mobile optimization
- Advanced rotation rules

## File Structure
```
SDR LEAD Rotation/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   └── index.css
└── README.md
```

## Contributing

This project is designed to be highly customizable. All aspects can be modified:
- Add/edit/delete sales reps
- Modify rotation sequences
- Adjust parameters and property types
- Customize entry types and validation rules

The modular component structure makes it easy to extend functionality and integrate with external systems.