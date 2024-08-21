export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-600">CareHub</h1>
          <p className="text-gray-500 text-sm mt-1">Healthcare Practice Management</p>
        </div>
        {children}
      </div>
    </div>
  );
}
